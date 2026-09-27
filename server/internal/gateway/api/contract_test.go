package api_test

import (
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
)

// TestContractIsValid loads and validates the document this package is
// generated from. It caught a real defect while this file was being written:
// a description string containing "only: what" was parsed as a nested YAML
// mapping rather than a scalar, and the loader failed with a YAML syntax
// error naming the line. Quoting the string fixed it. That is the shape of
// failure this test exists to catch before oapi-codegen or openapi-typescript
// meet it instead and fail with a less legible error, or silently generate
// something wrong.
func TestContractIsValid(t *testing.T) {
	loader := openapi3.NewLoader()
	doc, err := loader.LoadFromFile("../../../../contracts/openapi/openapi.yaml")
	if err != nil {
		t.Fatalf("contracts/openapi/openapi.yaml did not parse: %v", err)
	}
	if err := doc.Validate(loader.Context); err != nil {
		t.Fatalf("contracts/openapi/openapi.yaml is not a valid OpenAPI 3.1 document: %v", err)
	}
}
