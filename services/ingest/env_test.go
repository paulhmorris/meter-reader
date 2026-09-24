package ingest

import (
	"strings"
	"testing"
)

func lookup(env map[string]string) func(string) string {
	return func(name string) string { return env[name] }
}

func TestRequireEnvReturnsTheValueWhenSet(t *testing.T) {
	value, err := RequireEnv("DATABASE_URL", lookup(map[string]string{"DATABASE_URL": "postgres://x"}))
	if err != nil || value != "postgres://x" {
		t.Errorf("got %q, %v", value, err)
	}
}

func TestRequireEnvNamesAMissingOrEmptyVariable(t *testing.T) {
	for _, env := range []map[string]string{{}, {"DATABASE_URL": ""}} {
		if _, err := RequireEnv("DATABASE_URL", lookup(env)); err == nil || !strings.Contains(err.Error(), "DATABASE_URL") {
			t.Errorf("env %v: got error %v, want one naming DATABASE_URL", env, err)
		}
	}
}
