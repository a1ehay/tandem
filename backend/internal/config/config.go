package config

import (
	"fmt"
	"net"
	"strconv"
	"strings"
)

const defaultAddress = ":8080"

type Config struct {
	HTTPAddress string
}

func Load(getenv func(string) string) (Config, error) {
	address := strings.TrimSpace(getenv("HTTP_ADDR"))
	if address == "" {
		address = defaultAddress
	}
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return Config{}, fmt.Errorf("invalid HTTP_ADDR %q: expected host:port: %w", address, err)
	}
	if strings.ContainsAny(host, " \t\r\n") {
		return Config{}, fmt.Errorf("invalid HTTP_ADDR %q: host contains whitespace", address)
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 1 || portNumber > 65535 {
		return Config{}, fmt.Errorf("invalid HTTP_ADDR %q: port must be between 1 and 65535", address)
	}
	return Config{HTTPAddress: address}, nil
}
