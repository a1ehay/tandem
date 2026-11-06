FROM maven:3.9.11-eclipse-temurin-17

WORKDIR /workspace
COPY database/pom.xml database/pom.xml
COPY database/src database/src
WORKDIR /workspace/database
RUN mvn -q -DskipTests compile

ENTRYPOINT ["mvn", "-q", "exec:java"]
