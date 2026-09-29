# Builds the one static binary docs/prd/API.md section 11 names. Build
# context is server/ (the module root), so this runs as:
#   docker build -f deploy/Dockerfile .
# from inside server/, which is what compose.yaml's build.context does.

FROM golang:1.27.1 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/seametry ./cmd/seametry

FROM gcr.io/distroless/static-debian12
COPY --from=build /out/seametry /seametry
EXPOSE 8080
ENTRYPOINT ["/seametry"]
