package ingest

import "fmt"

// RequireEnv reads a variable through getenv (os.Getenv outside tests), treating an empty value as missing.
func RequireEnv(name string, getenv func(string) string) (string, error) {
	value := getenv(name)
	if value == "" {
		return "", fmt.Errorf("missing required environment variable %s", name)
	}
	return value, nil
}
