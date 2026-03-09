"""
Module 4: Διαχείριση Σχημάτων (Schema Engine)
Μετατρέπει τις μεταβλητές που ορίζει ο χρήστης στο UI σε αυστηρό JSON Schema,
συμβατό με τις προδιαγραφές Structured Outputs του Gemini API.

Υποστηριζόμενοι τύποι πεδίων:
  string  → str  (κείμενο, ΑΦΜ, αριθμοί τιμολογίου κ.λπ.)
  number  → float (χρηματικά ποσά, ποσοστά)
  integer → int   (ποσότητες)
  boolean → bool  (ναι/όχι πεδία)
  date    → str με format "date" (ISO 8601: YYYY-MM-DD)
  array   → list  (πολλαπλές γραμμές τιμολογίου)
"""

import json
from typing import Any, Dict, List, Optional


# ── Σταθερές ─────────────────────────────────────────────────────────────────

SUPPORTED_TYPES = {"string", "number", "integer", "boolean", "date", "array"}

# Χαρτογράφηση από τους φιλικούς τύπους μας → JSON Schema types
TYPE_MAP: Dict[str, Dict] = {
    "string":  {"type": "string"},
    "number":  {"type": "number"},
    "integer": {"type": "integer"},
    "boolean": {"type": "boolean"},
    "date":    {"type": "string", "format": "date"},   # ISO 8601
    "array":   {"type": "array",  "items": {"type": "string"}},
}


# ── Κύρια Κλάση ───────────────────────────────────────────────────────────────

class SchemaBuilder:
    """
    Παράγει JSON Schema από ένα λεξικό (dictionary) μεταβλητών.

    Παράδειγμα εισόδου:
        {
            "ΑΦΜ Πελάτη":   {"type": "string",  "description": "ΑΦΜ αγοραστή",  "required": True},
            "Σύνολο ΦΠΑ":   {"type": "number",  "description": "Ποσό ΦΠΑ σε €", "required": True},
            "Ημερομηνία":   {"type": "date",    "description": "Ημ. έκδοσης",   "required": False},
        }

    Παράδειγμα εξόδου (JSON Schema):
        {
            "type": "object",
            "properties": {
                "ΑΦΜ Πελάτη": {"type": "string",  "description": "ΑΦΜ αγοραστή"},
                "Σύνολο ΦΠΑ": {"type": "number",  "description": "Ποσό ΦΠΑ σε €"},
                "Ημερομηνία": {"type": "string",  "format": "date", ...},
            },
            "required": ["ΑΦΜ Πελάτη", "Σύνολο ΦΠΑ"],
            "additionalProperties": false
        }
    """

    def build(self, fields: Dict[str, Dict[str, Any]]) -> Dict:
        """
        Κύρια μέθοδος: μετατρέπει fields dict → JSON Schema dict.

        :param fields: Λεξικό με ονόματα πεδίων ως keys και metadata ως values.
                       Κάθε value μπορεί να περιέχει:
                         - type (υποχρεωτικό): "string" | "number" | "integer" |
                                               "boolean" | "date" | "array"
                         - description (προαιρετικό): περιγραφή πεδίου
                         - required (προαιρετικό, default True): αν είναι υποχρεωτικό
                         - nullable (προαιρετικό, default False): αν επιτρέπεται null
                         - enum (προαιρετικό): λίστα αποδεκτών τιμών
        :returns: Έγκυρο JSON Schema dict
        :raises ValueError: αν τα fields είναι κενά ή περιέχουν άγνωστο type
        """
        if not fields:
            raise ValueError("Το λεξικό πεδίων δεν μπορεί να είναι κενό.")

        properties  : Dict[str, Any] = {}
        required_fields: List[str]   = []

        for field_name, meta in fields.items():
            field_name = field_name.strip()
            if not field_name:
                raise ValueError("Τα ονόματα πεδίων δεν μπορούν να είναι κενά.")

            field_type = str(meta.get("type", "string")).lower().strip()
            if field_type not in SUPPORTED_TYPES:
                raise ValueError(
                    f"Άγνωστος τύπος '{field_type}' για πεδίο '{field_name}'. "
                    f"Αποδεκτοί: {sorted(SUPPORTED_TYPES)}"
                )

            # Βασική δομή από TYPE_MAP (deep copy για ασφάλεια)
            prop = dict(TYPE_MAP[field_type])

            # Προαιρετική περιγραφή
            if "description" in meta and meta["description"]:
                prop["description"] = str(meta["description"])

            # Nullable → χρήση anyOf με null
            if meta.get("nullable", False):
                prop = {"anyOf": [prop, {"type": "null"}]}

            # Enum περιορισμός
            if "enum" in meta and meta["enum"]:
                prop["enum"] = list(meta["enum"])

            properties[field_name] = prop

            # Required (default: True)
            if meta.get("required", True):
                required_fields.append(field_name)

        schema: Dict[str, Any] = {
            "type":                 "object",
            "properties":           properties,
            "additionalProperties": False,
        }

        if required_fields:
            schema["required"] = required_fields

        return schema

    def build_from_list(self, fields: List[Dict[str, Any]]) -> Dict:
        """
        Εναλλακτική είσοδος: λίστα από dicts με πεδίο "name".

        Παράδειγμα:
            [
                {"name": "ΑΦΜ",      "type": "string",  "required": True},
                {"name": "Σύνολο",   "type": "number",  "required": True},
                {"name": "Σχόλια",   "type": "string",  "required": False},
            ]
        """
        if not fields:
            raise ValueError("Η λίστα πεδίων δεν μπορεί να είναι κενή.")

        fields_dict: Dict[str, Dict] = {}
        for item in fields:
            name = item.get("name", "").strip()
            if not name:
                raise ValueError("Κάθε πεδίο πρέπει να έχει 'name'.")
            meta = {k: v for k, v in item.items() if k != "name"}
            fields_dict[name] = meta

        return self.build(fields_dict)

    def to_json(self, fields: Dict[str, Dict[str, Any]],
                indent: int = 2) -> str:
        """Επιστρέφει το JSON Schema ως pretty-printed string."""
        return json.dumps(self.build(fields), ensure_ascii=False, indent=indent)

    def validate_schema_structure(self, schema: Dict) -> bool:
        """
        Επαλήθευση ότι ένα schema έχει την αναμενόμενη δομή
        για το Gemini Structured Outputs API.

        Ελέγχει:
          - Ύπαρξη "type": "object"
          - Ύπαρξη "properties" dict
          - "additionalProperties": False  (απαίτηση Gemini)
          - Κάθε property έχει έγκυρο JSON Schema type
        """
        if not isinstance(schema, dict):
            return False
        if schema.get("type") != "object":
            return False
        if not isinstance(schema.get("properties"), dict):
            return False
        if schema.get("additionalProperties") is not False:
            return False

        valid_json_types = {"string", "number", "integer", "boolean", "array", "object", "null"}

        for prop_name, prop_def in schema["properties"].items():
            if not isinstance(prop_def, dict):
                return False
            # anyOf (nullable) — έλεγχος εσωτερικά
            if "anyOf" in prop_def:
                for sub in prop_def["anyOf"]:
                    if sub.get("type") not in valid_json_types:
                        return False
            elif prop_def.get("type") not in valid_json_types:
                return False

        return True
