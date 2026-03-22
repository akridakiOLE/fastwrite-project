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
  array   → list of objects (γραμμές τιμολογίου με sub-fields)
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
    # array χτίζεται δυναμικά με _build_array_prop()
}

# Default sub-fields για line_items αν δεν δοθούν custom
DEFAULT_LINE_ITEM_FIELDS = [
    {"name": "description", "type": "string"},
    {"name": "quantity",    "type": "number"},
    {"name": "unit_price",  "type": "number"},
    {"name": "total",       "type": "number"},
]


# ── Κύρια Κλάση ───────────────────────────────────────────────────────────────

class SchemaBuilder:
    """
    Παράγει JSON Schema από ένα λεξικό (dictionary) μεταβλητών.

    Υποστηρίζει array fields με nested object items για line items τιμολογίων.

    Παράδειγμα εισόδου με array:
        {
            "invoice_number": {"type": "string"},
            "total_amount":   {"type": "number"},
            "line_items":     {
                "type": "array",
                "items": [
                    {"name": "description", "type": "string"},
                    {"name": "quantity",    "type": "number"},
                    {"name": "unit_price",  "type": "number"},
                    {"name": "total",       "type": "number"},
                ]
            },
        }
    """

    def build(self, fields: Dict[str, Dict[str, Any]]) -> Dict:
        """
        Κύρια μέθοδος: μετατρέπει fields dict → JSON Schema dict.

        :param fields: Λεξικό με ονόματα πεδίων ως keys και metadata ως values.
        :returns: Έγκυρο JSON Schema dict
        :raises ValueError: αν τα fields είναι κενά ή περιέχουν άγνωστο type
        """
        if not fields:
            raise ValueError("Το λεξικό πεδίων δεν μπορεί να είναι κενό.")

        properties     : Dict[str, Any] = {}
        required_fields: List[str]      = []

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

            # ── Array με nested objects (line items) ─────────────────────
            if field_type == "array":
                sub_fields = meta.get("items", DEFAULT_LINE_ITEM_FIELDS)
                prop = self._build_array_prop(sub_fields)
            else:
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

        Υποστηρίζει array fields με "items" key:
            [
                {"name": "invoice_number", "type": "string", "required": True},
                {"name": "total_amount",   "type": "number", "required": True},
                {
                    "name": "line_items",
                    "type": "array",
                    "required": True,
                    "items": [
                        {"name": "description", "type": "string"},
                        {"name": "quantity",    "type": "number"},
                        {"name": "unit_price",  "type": "number"},
                        {"name": "total",       "type": "number"},
                    ]
                },
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
            if "anyOf" in prop_def:
                for sub in prop_def["anyOf"]:
                    if sub.get("type") not in valid_json_types:
                        return False
            elif prop_def.get("type") not in valid_json_types:
                return False

        return True

    # ── Private Helpers ───────────────────────────────────────────────────────

    def _build_array_prop(self, sub_fields: List[Dict]) -> Dict:
        """
        Χτίζει JSON Schema για array of objects.

        sub_fields: λίστα dicts με "name" και "type"
        Παράδειγμα output:
            {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "description": {"type": "string"},
                        "quantity":    {"type": "number"},
                        "unit_price":  {"type": "number"},
                        "total":       {"type": "number"},
                    },
                    "required": ["description", "quantity", "unit_price", "total"]
                }
            }
        """
        if not sub_fields:
            sub_fields = DEFAULT_LINE_ITEM_FIELDS

        item_properties: Dict[str, Any] = {}
        item_required  : List[str]      = []

        for sf in sub_fields:
            sf_name = sf.get("name", "").strip()
            if not sf_name:
                continue
            sf_type = str(sf.get("type", "string")).lower().strip()
            if sf_type not in TYPE_MAP:
                sf_type = "string"  # fallback

            item_properties[sf_name] = dict(TYPE_MAP[sf_type])
            item_required.append(sf_name)

        return {
            "type": "array",
            "items": {
                "type":                 "object",
                "properties":           item_properties,
                "required":             item_required,
                "additionalProperties": False,
            }
        }

    @staticmethod
    def extract_array_fields(fields: List[Dict]) -> List[str]:
        """
        Επιστρέφει τα ονόματα πεδίων τύπου array από μια λίστα fields.
        Χρήσιμο για τον exporter να ξέρει ποια πεδία είναι line items.
        """
        return [f["name"] for f in fields if f.get("type") == "array"]
