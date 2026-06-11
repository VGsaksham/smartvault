#!/bin/bash
echo '123456' | sudo -S tee /etc/apt/sources.list >/dev/null <<'EOF'
deb http://archive.ubuntu.com/ubuntu/ noble main restricted universe multiverse
deb http://archive.ubuntu.com/ubuntu/ noble-updates main restricted universe multiverse
deb http://security.ubuntu.com/ubuntu/ noble-security main restricted universe multiverse
EOF
echo '123456' | sudo -S apt-get update -qq
echo APT_FIXED_OK
