FROM eclipse-temurin:17-jdk-jammy AS build
WORKDIR /src
COPY pom.xml .
COPY src ./src
RUN apt-get update && apt-get install -y --no-install-recommends maven \
  && mvn -q -DskipTests package \
  && rm -rf /var/lib/apt/lists/*

FROM eclipse-temurin:17-jre-jammy
WORKDIR /app
RUN useradd --system --uid 10001 --create-home digidoc \
  && mkdir -p /run/secrets \
  && chown -R digidoc:digidoc /app /run/secrets
COPY --from=build /src/target/digidoc-sidecar-0.1.0.jar /app/sidecar.jar
ENV PORT=9090 \
    BIND=0.0.0.0 \
    ALLOW_UNAUTHENTICATED=false
EXPOSE 9090
USER digidoc
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/${PORT:-9090} && printf 'GET /ready HTTP/1.0\\r\\n\\r\\n' >&3 && grep -q '200' <&3"]
CMD ["java", "-jar", "/app/sidecar.jar"]
