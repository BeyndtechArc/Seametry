// Package api holds types generated from contracts/openapi/openapi.yaml.
// Nothing in this package is hand written except this file and its test.
package api

//go:generate go tool oapi-codegen -package api -generate types -o types.gen.go ../../../../contracts/openapi/openapi.yaml
