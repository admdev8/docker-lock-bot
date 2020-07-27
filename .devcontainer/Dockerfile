FROM node:lts

## Install latest docker-cli & docker-lock
RUN curl -fsSL https://get.docker.com | bash && \
    DOCKER_LOCK_VERSION="$(git ls-remote https://github.com/michaelperel/docker-lock | grep refs/tags | grep -oE "[0-9]+\.[0-9]+\.[0-9]+$" | sort --version-sort | tail -n 1)" && \
    mkdir -p "${HOME}/.docker/cli-plugins" && \
    curl -fsSL "https://github.com/michaelperel/docker-lock/releases/download/v${DOCKER_LOCK_VERSION}/docker-lock-linux" -o "${HOME}/.docker/cli-plugins/docker-lock" && \
    chmod +x "${HOME}/.docker/cli-plugins/docker-lock"