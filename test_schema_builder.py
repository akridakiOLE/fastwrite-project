"""
Unit Tests - Module 4: SchemaBuilder
Δέχεται dictionary με 3+ μεταβλητές, παράγει JSON Schema,
και επικυρώνει συμβατότητα με Gemini Structured Outputs API.
Χωρίς κλήσεις δικτύου.
"""

import sys
import json
import unittest

sys.path.insert(0, "/app/projects")

from schema_builder import SchemaBuilder, SUPPORTED_TYPES, TYPE_MAP


class TestSchemaBuilderBasic(unittest.TestCase):
    """Βασικοί έλεγχοι παραγωγής schema."""

    def setUp(self):
        self.builder = SchemaBuilder()

    def test_three_fields_produce_valid_schema(self):
        """3 τυχαίες μεταβλητές → έγκυρο JSON Schema."""
        fields = {
            "ΑΦΜ Πελάτη":  {"type": "string",  "description": "ΑΦΜ αγοραστή"},
            "Σύνολο ΦΠΑ":  {"type": "number",  "description": "Ποσό ΦΠΑ σε €"},
            "Ημερομηνία":  {"type": "date",    "description": "Ημερομηνία έκδοσης"},
        }
        schema = self.builder.build(fields)

        # Κορυφαία δομή
        self.assertEqual(schema["type"], "object")
        self.assertIn("properties", schema)
        self.assertFalse(schema["additionalProperties"])

    def test_properties_contain_all_fields(self):
        """Όλα τα πεδία εισόδου εμφανίζονται στο schema."""
        fields = {
            "Αριθμός Τιμολογίου": {"type": "string"},
            "Καθαρή Αξία":        {"type": "number"},
            "Ποσότητα":           {"type": "integer"},
        }
        schema = self.builder.build(fields)
        props  = schema["properties"]

        self.assertIn("Αριθμός Τιμολογίου", props)
        self.assertIn("Καθαρή Αξία", props)
        self.assertIn("Ποσότητα", props)

    def test_required_fields_list(self):
        """Τα required=True πεδία εμφανίζονται στο 'required' array."""
        fields = {
            "ΑΦΜ":       {"type": "string",  "required": True},
            "Σύνολο":    {"type": "number",  "required": True},
            "Σχόλια":    {"type": "string",  "required": False},
        }
        schema = self.builder.build(fields)
        self.assertIn("required", schema)
        self.assertIn("ΑΦΜ",    schema["required"])
        self.assertIn("Σύνολο", schema["required"])
        self.assertNotIn("Σχόλια", schema["required"])

    def test_required_default_is_true(self):
        """Αν δεν οριστεί required, το default είναι True."""
        fields = {"Πεδίο Α": {"type": "string"}}
        schema = self.builder.build(fields)
        self.assertIn("Πεδίο Α", schema.get("required", []))

    def test_additional_properties_is_false(self):
        """additionalProperties πρέπει να είναι False (Gemini απαίτηση)."""
        fields = {"Τεστ": {"type": "string"}}
        schema = self.builder.build(fields)
        self.assertIs(schema["additionalProperties"], False)


class TestSchemaBuilderTypes(unittest.TestCase):
    """Έλεγχος χαρτογράφησης τύπων."""

    def setUp(self):
        self.builder = SchemaBuilder()

    def test_string_type_mapping(self):
        schema = self.builder.build({"x": {"type": "string"}})
        self.assertEqual(schema["properties"]["x"]["type"], "string")

    def test_number_type_mapping(self):
        schema = self.builder.build({"x": {"type": "number"}})
        self.assertEqual(schema["properties"]["x"]["type"], "number")

    def test_integer_type_mapping(self):
        schema = self.builder.build({"x": {"type": "integer"}})
        self.assertEqual(schema["properties"]["x"]["type"], "integer")

    def test_boolean_type_mapping(self):
        schema = self.builder.build({"x": {"type": "boolean"}})
        self.assertEqual(schema["properties"]["x"]["type"], "boolean")

    def test_date_type_mapping(self):
        """Date → string με format: date (ISO 8601)."""
        schema = self.builder.build({"x": {"type": "date"}})
        prop = schema["properties"]["x"]
        self.assertEqual(prop["type"], "string")
        self.assertEqual(prop.get("format"), "date")

    def test_array_type_mapping(self):
        schema = self.builder.build({"x": {"type": "array"}})
        prop = schema["properties"]["x"]
        self.assertEqual(prop["type"], "array")
        self.assertIn("items", prop)

    def test_all_supported_types_produce_valid_schema(self):
        """Κάθε supported type παράγει έγκυρο schema."""
        for t in SUPPORTED_TYPES:
            with self.subTest(type=t):
                schema = self.builder.build({f"field_{t}": {"type": t}})
                self.assertTrue(
                    self.builder.validate_schema_structure(schema),
                    f"Άκυρο schema για type='{t}'"
                )


class TestSchemaBuilderAdvanced(unittest.TestCase):
    """Προχωρημένα χαρακτηριστικά: nullable, enum, description."""

    def setUp(self):
        self.builder = SchemaBuilder()

    def test_description_included_in_property(self):
        """Η description μεταφέρεται στο αντίστοιχο property."""
        fields = {"ΑΦΜ": {"type": "string", "description": "ΑΦΜ αγοραστή"}}
        schema = self.builder.build(fields)
        self.assertEqual(
            schema["properties"]["ΑΦΜ"].get("description"),
            "ΑΦΜ αγοραστή"
        )

    def test_nullable_field_uses_anyof(self):
        """nullable=True → anyOf με null."""
        fields = {"Έκπτωση": {"type": "number", "nullable": True}}
        schema = self.builder.build(fields)
        prop   = schema["properties"]["Έκπτωση"]
        self.assertIn("anyOf", prop)
        types  = [x.get("type") for x in prop["anyOf"]]
        self.assertIn("number", types)
        self.assertIn("null",   types)

    def test_enum_field(self):
        """enum → περιορισμός αποδεκτών τιμών."""
        fields = {
            "Κατάσταση": {
                "type": "string",
                "enum": ["Pending", "Processed", "Review"]
            }
        }
        schema = self.builder.build(fields)
        prop   = schema["properties"]["Κατάσταση"]
        self.assertEqual(prop.get("enum"), ["Pending", "Processed", "Review"])

    def test_build_from_list(self):
        """build_from_list: λίστα dicts με 'name' key."""
        fields_list = [
            {"name": "ΑΦΜ",     "type": "string",  "required": True},
            {"name": "Σύνολο",  "type": "number",  "required": True},
            {"name": "Σχόλια",  "type": "string",  "required": False},
        ]
        schema = self.builder.build_from_list(fields_list)
        self.assertIn("ΑΦΜ",    schema["properties"])
        self.assertIn("Σύνολο", schema["properties"])
        self.assertIn("ΑΦΜ",    schema["required"])
        self.assertNotIn("Σχόλια", schema.get("required", []))

    def test_to_json_returns_valid_json_string(self):
        """to_json επιστρέφει έγκυρο JSON string."""
        fields = {
            "ΑΦΜ":    {"type": "string"},
            "Ποσό":   {"type": "number"},
        }
        json_str = self.builder.to_json(fields)
        parsed   = json.loads(json_str)      # δεν πρέπει να ρίξει exception
        self.assertEqual(parsed["type"], "object")


class TestSchemaBuilderGeminiCompatibility(unittest.TestCase):
    """
    Έλεγχος συμβατότητας με Gemini Structured Outputs API.
    Βασίζεται στις επίσημες απαιτήσεις:
      - type: object στο root
      - properties: dict
      - additionalProperties: false
      - Κάθε property έχει έγκυρο JSON type
    """

    def setUp(self):
        self.builder = SchemaBuilder()

    def test_invoice_schema_gemini_compatible(self):
        """Πλήρες τιμολόγιο schema είναι Gemini-συμβατό."""
        fields = {
            "Αριθμός Τιμολογίου": {"type": "string",  "description": "Μοναδικός αριθμός"},
            "ΑΦΜ Πωλητή":         {"type": "string",  "description": "ΑΦΜ εκδότη"},
            "ΑΦΜ Αγοραστή":       {"type": "string",  "description": "ΑΦΜ παραλήπτη"},
            "Ημερομηνία":         {"type": "date",    "description": "Ημ. έκδοσης"},
            "Καθαρή Αξία":        {"type": "number",  "description": "Ποσό προ ΦΠΑ"},
            "ΦΠΑ %":              {"type": "number",  "description": "Συντελεστής ΦΠΑ"},
            "Σύνολο ΦΠΑ":         {"type": "number",  "description": "Ποσό ΦΠΑ"},
            "Τελικό Ποσό":        {"type": "number",  "description": "Σύνολο με ΦΠΑ"},
            "Έχει Έκπτωση":       {"type": "boolean", "required": False},
        }
        schema = self.builder.build(fields)
        self.assertTrue(
            self.builder.validate_schema_structure(schema),
            f"Schema δεν είναι Gemini-συμβατό:\n{json.dumps(schema, indent=2, ensure_ascii=False)}"
        )

    def test_validate_schema_catches_missing_additional_properties(self):
        """Ένα schema χωρίς additionalProperties:false αποτυγχάνει validation."""
        bad_schema = {
            "type": "object",
            "properties": {"x": {"type": "string"}},
            # Λείπει: "additionalProperties": False
        }
        self.assertFalse(self.builder.validate_schema_structure(bad_schema))

    def test_validate_schema_catches_wrong_root_type(self):
        """Ένα schema με type!=object αποτυγχάνει validation."""
        bad_schema = {
            "type": "array",
            "items": {"type": "string"},
            "additionalProperties": False,
        }
        self.assertFalse(self.builder.validate_schema_structure(bad_schema))

    def test_validate_schema_catches_invalid_property_type(self):
        """Ένα property με άγνωστο type αποτυγχάνει validation."""
        bad_schema = {
            "type": "object",
            "properties": {"x": {"type": "fancy_type"}},
            "additionalProperties": False,
        }
        self.assertFalse(self.builder.validate_schema_structure(bad_schema))

    def test_required_is_list_of_strings(self):
        """Το required array περιέχει μόνο strings."""
        fields = {
            "Α": {"type": "string", "required": True},
            "Β": {"type": "number", "required": True},
        }
        schema = self.builder.build(fields)
        for item in schema.get("required", []):
            self.assertIsInstance(item, str)


class TestSchemaBuilderErrors(unittest.TestCase):
    """Έλεγχος διαχείρισης σφαλμάτων."""

    def setUp(self):
        self.builder = SchemaBuilder()

    def test_empty_fields_raises_value_error(self):
        with self.assertRaises(ValueError):
            self.builder.build({})

    def test_unknown_type_raises_value_error(self):
        with self.assertRaises(ValueError):
            self.builder.build({"x": {"type": "fancy_unknown_type"}})

    def test_empty_field_name_raises_value_error(self):
        with self.assertRaises(ValueError):
            self.builder.build({"  ": {"type": "string"}})

    def test_empty_list_raises_value_error(self):
        with self.assertRaises(ValueError):
            self.builder.build_from_list([])

    def test_list_item_without_name_raises_value_error(self):
        with self.assertRaises(ValueError):
            self.builder.build_from_list([{"type": "string"}])


if __name__ == "__main__":
    print("=" * 60)
    print("MODULE 4 - Unit Tests: SchemaBuilder")
    print("=" * 60)

    loader = unittest.TestLoader()
    suite  = unittest.TestSuite()
    suite.addTests(loader.loadTestsFromTestCase(TestSchemaBuilderBasic))
    suite.addTests(loader.loadTestsFromTestCase(TestSchemaBuilderTypes))
    suite.addTests(loader.loadTestsFromTestCase(TestSchemaBuilderAdvanced))
    suite.addTests(loader.loadTestsFromTestCase(TestSchemaBuilderGeminiCompatibility))
    suite.addTests(loader.loadTestsFromTestCase(TestSchemaBuilderErrors))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    print("\n" + "=" * 60)
    if result.wasSuccessful():
        total = result.testsRun
        print(f"✅ ΕΠΙΤΥΧΙΑ: {total}/{total} tests πέρασαν!")
        print("✅ Module 4 είναι έτοιμο. Μπορούμε να προχωρήσουμε στο Module 5.")
    else:
        failures = len(result.failures) + len(result.errors)
        print(f"❌ ΑΠΟΤΥΧΙΑ: {failures} tests απέτυχαν.")
        sys.exit(1)
    print("=" * 60)
