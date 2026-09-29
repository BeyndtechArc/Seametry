// Package api holds types and the strict server interface generated from
// contracts/openapi/openapi.yaml. Nothing in this package is hand written
// except this file and its test.
package api

//go:generate go tool oapi-codegen -package api -generate types -o types.gen.go ../../../../contracts/openapi/openapi.yaml

// server.gen.go asks for std-http-server and strict-server separately from
// types, rather than combining them in one -generate list, so it can hold no
// type declarations of its own: two files in one package each declaring the
// same struct is a compile error, not a generation nicety.
//go:generate go tool oapi-codegen -package api -generate std-http,strict-server -o server.gen.go ../../../../contracts/openapi/openapi.yaml
