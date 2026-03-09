"""
Module 6: Κανόνες Λογιστικής Εγκυρότητας (Validation Engine)
Λαμβάνει το JSON από το AI (Module 5) και εφαρμόζει:
  1. Μαθηματικούς κανόνες  : Καθαρή Αξία + ΦΠΑ = Τελικό Ποσό
  2. Ελέγχους τύπων        : σωστοί τύποι δεδομένων ανά πεδίο
  3. Ελέγχους παρουσίας    : υποχρεωτικά πεδία δεν είναι None/null
  4. Ελέγχους εύρους       : αρνητικά ποσά, μηδενικά σύνολα κ.λπ.
  5. Format ελέγχους       : ΑΦΜ (9 ψηφία), ημερομηνία ISO 8601 κ.λπ.

Αν βρεθεί οποιοδήποτε σφάλμα → status "Needs Human Review".
Αν όλα περάσουν                → status "Validated".
"""

import re
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


# ── Σταθερές ─────────────────────────────────────────────────────────────────

TOLERANCE          = Decimal("0.02")   # ±2 λεπτά ανοχή σε αριθμητικούς ελέγχους
AFM_PATTERN        = re.compile(r"^\d{9}$")
DATE_PATTERN       = re.compile(r"^\d{4}-\d{2}-\d{2}$")
INVOICE_NO_PATTERN = re.compile(r"^[\w\-/\.]{1,50}$")

STATUS_VALIDATED   = "Validated"
STATUS_REVIEW      = "Needs Human Review"
STATUS_PENDING     = "Pending"


# ── Dataclasses ───────────────────────────────────────────────────────────────

@dataclass
class ValidationError:
    """Ένα μεμονωμένο σφάλμα επικύρωσης."""
    field    : str
    rule     : str
    message  : str
    severity : str = "error"   # "error" | "warning"

    def to_dict(self) -> Dict:
        return {
            "field":    self.field,
            "rule":     self.rule,
            "message":  self.message,
            "severity": self.severity,
        }


@dataclass
class ValidationResult:
    """Αποτέλεσμα επικύρωσης ενός εγγράφου."""
    status          : str                   = STATUS_PENDING
    is_valid        : bool                  = False
    errors          : List[ValidationError] = field(default_factory=list)
    warnings        : List[ValidationError] = field(default_factory=list)
    validated_data  : Dict[str, Any]        = field(default_factory=dict)
    validated_at    : str                   = ""
    rules_checked   : int                   = 0

    def add_error(self, field: str, rule: str, message: str):
        self.errors.append(ValidationError(field, rule, message, "error"))

    def add_warning(self, field: str, rule: str, message: str):
        self.warnings.append(ValidationError(field, rule, message, "warning"))

    def to_dict(self) -> Dict:
        return {
            "status":         self.status,
            "is_valid":       self.is_valid,
            "errors":         [e.to_dict() for e in self.errors],
            "warnings":       [w.to_dict() for w in self.warnings],
            "validated_data": self.validated_data,
            "validated_at":   self.validated_at,
            "rules_checked":  self.rules_checked,
        }


# ── Κύρια Κλάση ───────────────────────────────────────────────────────────────

class InvoiceValidator:
    """
    Επικύρωση δεδομένων τιμολογίου.

    Αναμενόμενα πεδία (όλα προαιρετικά — ελέγχονται μόνο αν υπάρχουν):
        net_amount     : float  — Καθαρή αξία (προ ΦΠΑ)
        vat_rate       : float  — Συντελεστής ΦΠΑ (π.χ. 24.0)
        vat_amount     : float  — Ποσό ΦΠΑ
        total_amount   : float  — Τελικό ποσό (με ΦΠΑ)
        vendor_afm     : str    — ΑΦΜ πωλητή (9 ψηφία)
        buyer_afm      : str    — ΑΦΜ αγοραστή (9 ψηφία)
        invoice_number : str    — Αριθμός τιμολογίου
        invoice_date   : str    — Ημερομηνία (YYYY-MM-DD)
        discount       : float  — Έκπτωση (προαιρετική)
    """

    def validate(self, data: Dict[str, Any]) -> ValidationResult:
        """
        Κύρια μέθοδος επικύρωσης.
        :param data: Dict με τα εξαγόμενα δεδομένα από το AI
        :returns:    ValidationResult με status και λίστα σφαλμάτων
        """
        result              = ValidationResult()
        result.validated_data = dict(data)
        result.validated_at = datetime.utcnow().isoformat()
        rules_count         = 0

        # ── 1. Έλεγχοι παρουσίας ─────────────────────────────────────────
        rules_count += self._check_presence(data, result)

        # ── 2. Έλεγχοι τύπων ────────────────────────────────────────────
        rules_count += self._check_types(data, result)

        # ── 3. Έλεγχοι εύρους ───────────────────────────────────────────
        rules_count += self._check_ranges(data, result)

        # ── 4. Μαθηματικοί κανόνες ──────────────────────────────────────
        rules_count += self._check_math(data, result)

        # ── 5. Format ελέγχοι ────────────────────────────────────────────
        rules_count += self._check_formats(data, result)

        # ── Τελικό αποτέλεσμα ────────────────────────────────────────────
        result.rules_checked = rules_count
        if result.errors:
            result.is_valid = False
            result.status   = STATUS_REVIEW
        else:
            result.is_valid = True
            result.status   = STATUS_VALIDATED

        return result

    # ── Κανόνας 1: Παρουσία υποχρεωτικών πεδίων ─────────────────────────────

    def _check_presence(self, data: Dict, result: ValidationResult) -> int:
        """Ελέγχει ότι τα βασικά πεδία δεν είναι None."""
        REQUIRED = ["total_amount"]
        count    = 0

        for field_name in REQUIRED:
            count += 1
            val = data.get(field_name)
            if val is None:
                result.add_error(
                    field_name, "required_field",
                    f"Το πεδίο '{field_name}' είναι υποχρεωτικό και λείπει."
                )

        # Warning για συνιστώμενα πεδία
        RECOMMENDED = ["net_amount", "vat_amount", "invoice_number", "invoice_date"]
        for field_name in RECOMMENDED:
            count += 1
            if data.get(field_name) is None:
                result.add_warning(
                    field_name, "recommended_field",
                    f"Το πεδίο '{field_name}' συνιστάται αλλά λείπει."
                )

        return count

    # ── Κανόνας 2: Έλεγχοι τύπων ────────────────────────────────────────────

    def _check_types(self, data: Dict, result: ValidationResult) -> int:
        """Ελέγχει ότι τα πεδία έχουν τον σωστό τύπο δεδομένων."""
        NUMERIC_FIELDS = ["net_amount", "vat_amount", "total_amount",
                          "vat_rate", "discount"]
        STRING_FIELDS  = ["vendor_afm", "buyer_afm",
                          "invoice_number", "invoice_date"]
        count = 0

        for field_name in NUMERIC_FIELDS:
            count += 1
            val = data.get(field_name)
            if val is not None and not isinstance(val, (int, float)):
                result.add_error(
                    field_name, "type_check",
                    f"Το πεδίο '{field_name}' πρέπει να είναι αριθμός, "
                    f"αλλά βρέθηκε: {type(val).__name__} (τιμή: {val!r})"
                )

        for field_name in STRING_FIELDS:
            count += 1
            val = data.get(field_name)
            if val is not None and not isinstance(val, str):
                result.add_error(
                    field_name, "type_check",
                    f"Το πεδίο '{field_name}' πρέπει να είναι string, "
                    f"αλλά βρέθηκε: {type(val).__name__}"
                )

        return count

    # ── Κανόνας 3: Έλεγχοι εύρους ───────────────────────────────────────────

    def _check_ranges(self, data: Dict, result: ValidationResult) -> int:
        """Ελέγχει ότι τα ποσά είναι λογικά (μη αρνητικά, μη μηδενικά)."""
        count = 0

        # Μη αρνητικά ποσά
        NON_NEGATIVE = ["net_amount", "vat_amount", "total_amount", "discount"]
        for field_name in NON_NEGATIVE:
            count += 1
            val = data.get(field_name)
            if val is not None and isinstance(val, (int, float)) and val < 0:
                result.add_error(
                    field_name, "range_check",
                    f"Το πεδίο '{field_name}' δεν μπορεί να είναι αρνητικό: {val}"
                )

        # Μη μηδενικό total_amount
        count += 1
        total = data.get("total_amount")
        if total is not None and isinstance(total, (int, float)) and total == 0:
            result.add_warning(
                "total_amount", "zero_amount",
                "Το τελικό ποσό είναι μηδέν — ελέγξτε αν αυτό είναι σωστό."
            )

        # Λογικός ΦΠΑ (0–100%)
        count += 1
        vat_rate = data.get("vat_rate")
        if vat_rate is not None and isinstance(vat_rate, (int, float)):
            if not (0 <= vat_rate <= 100):
                result.add_error(
                    "vat_rate", "range_check",
                    f"Ο συντελεστής ΦΠΑ πρέπει να είναι 0–100%, βρέθηκε: {vat_rate}"
                )

        # total >= net_amount (αν υπάρχουν και τα δύο)
        count += 1
        net   = data.get("net_amount")
        total = data.get("total_amount")
        if (net is not None and total is not None
                and isinstance(net, (int, float))
                and isinstance(total, (int, float))
                and total < net):
            result.add_error(
                "total_amount", "range_check",
                f"Το τελικό ποσό ({total}) δεν μπορεί να είναι "
                f"μικρότερο από την καθαρή αξία ({net})."
            )

        return count

    # ── Κανόνας 4: Μαθηματικοί κανόνες ──────────────────────────────────────

    def _check_math(self, data: Dict, result: ValidationResult) -> int:
        """
        Ελέγχει: Καθαρή Αξία + ΦΠΑ = Τελικό Ποσό (με ανοχή ±0.02€)
        Επίσης:  Καθαρή Αξία × (ΦΠΑ% / 100) = Ποσό ΦΠΑ
        """
        count = 0

        net   = data.get("net_amount")
        vat   = data.get("vat_amount")
        total = data.get("total_amount")
        rate  = data.get("vat_rate")
        disc  = data.get("discount", 0) or 0

        # ── Κανόνας Α: net + vat = total ────────────────────────────────
        count += 1
        if all(isinstance(v, (int, float))
               for v in [net, vat, total]
               if v is not None):
            if net is not None and vat is not None and total is not None:
                expected = Decimal(str(net)) + Decimal(str(vat)) - Decimal(str(disc))
                actual   = Decimal(str(total))
                diff     = abs(expected - actual)
                if diff > TOLERANCE:
                    result.add_error(
                        "total_amount", "math_check",
                        f"Μαθηματικό σφάλμα: {net} (καθαρή) + {vat} (ΦΠΑ) "
                        f"- {disc} (έκπτωση) = {float(expected):.2f}, "
                        f"αλλά βρέθηκε total={total} "
                        f"(διαφορά: {float(diff):.4f}€)"
                    )

        # ── Κανόνας Β: net × rate% = vat ────────────────────────────────
        count += 1
        if all(isinstance(v, (int, float))
               for v in [net, vat, rate]
               if v is not None):
            if net is not None and vat is not None and rate is not None:
                expected_vat = Decimal(str(net)) * Decimal(str(rate)) / Decimal("100")
                actual_vat   = Decimal(str(vat))
                diff         = abs(expected_vat - actual_vat)
                if diff > TOLERANCE:
                    result.add_error(
                        "vat_amount", "math_check",
                        f"ΦΠΑ σφάλμα: {net} × {rate}% = {float(expected_vat):.2f}, "
                        f"αλλά βρέθηκε vat_amount={vat} "
                        f"(διαφορά: {float(diff):.4f}€)"
                    )

        return count

    # ── Κανόνας 5: Format ελέγχοι ────────────────────────────────────────────

    def _check_formats(self, data: Dict, result: ValidationResult) -> int:
        """Ελέγχει formats: ΑΦΜ (9 ψηφία), ημερομηνία (ISO 8601)."""
        count = 0

        # ΑΦΜ — 9 ψηφία
        for afm_field in ["vendor_afm", "buyer_afm"]:
            count += 1
            val = data.get(afm_field)
            if val is not None and isinstance(val, str):
                clean = val.strip()
                if not AFM_PATTERN.match(clean):
                    result.add_error(
                        afm_field, "format_check",
                        f"Μη έγκυρο ΑΦΜ '{clean}': πρέπει να είναι ακριβώς 9 ψηφία."
                    )

        # Ημερομηνία — YYYY-MM-DD
        count += 1
        date_val = data.get("invoice_date")
        if date_val is not None and isinstance(date_val, str):
            if not DATE_PATTERN.match(date_val):
                result.add_error(
                    "invoice_date", "format_check",
                    f"Μη έγκυρη ημερομηνία '{date_val}': "
                    f"απαιτείται μορφή YYYY-MM-DD."
                )
            else:
                # Έλεγχος ότι είναι πραγματική ημερομηνία
                try:
                    datetime.strptime(date_val, "%Y-%m-%d")
                except ValueError:
                    result.add_error(
                        "invoice_date", "format_check",
                        f"Μη πραγματική ημερομηνία: '{date_val}'."
                    )

        # Αριθμός τιμολογίου — χαρακτήρες
        count += 1
        inv_no = data.get("invoice_number")
        if inv_no is not None and isinstance(inv_no, str):
            if not inv_no.strip():
                result.add_error(
                    "invoice_number", "format_check",
                    "Ο αριθμός τιμολογίου δεν μπορεί να είναι κενός."
                )

        return count


# ── Γενικός Validator (για μη-τιμολόγια) ─────────────────────────────────────

class GenericValidator:
    """
    Γενικός validator για οποιοδήποτε schema.
    Εφαρμόζει μόνο τύπους και παρουσία — χωρίς λογιστικούς κανόνες.
    """

    def validate(self, data: Dict[str, Any],
                 schema: Dict[str, Any]) -> ValidationResult:
        result              = ValidationResult()
        result.validated_data = dict(data)
        result.validated_at = datetime.utcnow().isoformat()
        count               = 0

        properties = schema.get("properties", {})
        required   = schema.get("required", [])

        for field_name, prop_def in properties.items():
            # Παρουσία
            count += 1
            val = data.get(field_name)
            if field_name in required and val is None:
                result.add_error(
                    field_name, "required_field",
                    f"Υποχρεωτικό πεδίο '{field_name}' λείπει."
                )
                continue

            if val is None:
                continue

            # Τύπος
            count += 1
            expected_type = prop_def.get("type")
            type_ok = _check_json_type(val, expected_type)
            if not type_ok:
                result.add_error(
                    field_name, "type_check",
                    f"Πεδίο '{field_name}': αναμενόταν {expected_type}, "
                    f"βρέθηκε {type(val).__name__}"
                )

        result.rules_checked = count
        result.is_valid      = len(result.errors) == 0
        result.status        = STATUS_VALIDATED if result.is_valid else STATUS_REVIEW
        return result


# ── Helpers ───────────────────────────────────────────────────────────────────

def _check_json_type(value: Any, json_type: str) -> bool:
    """Ελέγχει αν μια τιμή ανταποκρίνεται στον JSON Schema type."""
    if json_type == "string":
        return isinstance(value, str)
    if json_type == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if json_type == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if json_type == "boolean":
        return isinstance(value, bool)
    if json_type == "array":
        return isinstance(value, list)
    if json_type == "object":
        return isinstance(value, dict)
    return True   # unknown type → pass
