# Builds the one static binary docs/prd/API.md section 11 names and carries
# the recorded Hall evidence published by /v1/hall/demonstration. The build
# context is the repository root so the image can include both server/ and
# shared/evidence/ without keeping a second copy of the transcript.

FROM golang:1.27.1 AS build
WORKDIR /src/server
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/seametry ./cmd/seametry

FROM gcr.io/distroless/static-debian12
COPY --from=build /out/seametry /seametry
COPY shared/evidence/hall-demo /shared/evidence/hall-demo
COPY shared/evidence/depth-2026-09-24.json /shared/evidence/depth-2026-09-24.json
COPY shared/evidence/demo-batch /shared/evidence/demo-batch
COPY shared/fixtures/mainnet /shared/fixtures/mainnet
COPY shared/fixtures/jupiter /shared/fixtures/jupiter
EXPOSE 8080
ENTRYPOINT ["/seametry"]
