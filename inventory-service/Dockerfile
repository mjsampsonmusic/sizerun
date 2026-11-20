# Build the jar with Maven. The cache mount keeps downloaded dependencies between builds.
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml .
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -q package -DskipTests

# Run it on a Java runtime image as a non-root user
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --uid 10001 --no-create-home app
COPY --from=build /workspace/target/inventory-service.jar app.jar
USER app
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
