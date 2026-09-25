package handlers

import (
	"context"
	"net/http"
	"net/http/httputil"
	"strings"
	"testing"

	"manju-flow/internal/config"
)

func TestBuildWanRequestPreservesAsyncHeaderCase(t *testing.T) {
	originalConfig := config.Cfg
	config.Cfg = &config.Config{Wan: config.WanConfig{APIKey: "test-key"}}
	defer func() { config.Cfg = originalConfig }()

	handler := AnimationHandler{}

	req, err := handler.buildWanRequest(context.Background(), http.MethodPost, "https://example.com", strings.NewReader("{}"))
	if err != nil {
		t.Fatalf("buildWanRequest returned error: %v", err)
	}
	if got := req.Header[HeaderDashScopeAsync]; len(got) != 1 || got[0] != "enable" {
		t.Fatalf("%s = %q, want enable", HeaderDashScopeAsync, got)
	}

	dump, err := httputil.DumpRequestOut(req, false)
	if err != nil {
		t.Fatalf("DumpRequestOut returned error: %v", err)
	}
	if !strings.Contains(string(dump), "X-DashScope-Async: enable") {
		t.Fatalf("request dump does not contain X-DashScope-Async: enable:\n%s", dump)
	}
}
