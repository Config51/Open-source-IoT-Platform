/**
 * Copyright © 2016-2022 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.thingsboard.server.msa;

import lombok.extern.slf4j.Slf4j;
import org.apache.commons.io.FileUtils;
import org.junit.ClassRule;
import org.junit.extensions.cpsuite.ClasspathSuite;
import org.junit.runner.RunWith;
import org.testcontainers.containers.DockerComposeContainer;
import org.testcontainers.containers.wait.strategy.Wait;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;

import static org.hamcrest.CoreMatchers.containsString;
import static org.hamcrest.CoreMatchers.is;
import static org.hamcrest.CoreMatchers.not;
import static org.hamcrest.MatcherAssert.assertThat;
import static org.junit.Assert.fail;

@RunWith(ClasspathSuite.class)
@ClasspathSuite.ClassnameFilters({"org.thingsboard.server.msa.*Test"})
@Slf4j
public class ContainerTestSuite {

    private static final String SOURCE_DIR = "./../../docker/";
    private static final String TB_CORE_LOG_REGEXP = ".*Starting polling for events.*";
    private static final String TRANSPORTS_LOG_REGEXP = ".*Going to recalculate partitions.*";

    private static DockerComposeContainer<?> testContainer;

    @ClassRule
    public static ThingsBoardDbInstaller installTb = new ThingsBoardDbInstaller();

    @ClassRule
    public static DockerComposeContainer getTestContainer() {
        if (testContainer == null) {
            boolean skipTailChildContainers = Boolean.valueOf(System.getProperty("blackBoxTests.skipTailChildContainers"));
            try {
                final String targetDir = FileUtils.getTempDirectoryPath() + "/" + "ContainerTestSuite-" + UUID.randomUUID() + "/";
                log.info("targetDir {}", targetDir);
                FileUtils.copyDirectory(new File(SOURCE_DIR), new File(targetDir));
                replaceInFile(targetDir + "docker-compose.yml", "    container_name: \"${LOAD_BALANCER_NAME}\"", "", "container_name");

                class DockerComposeContainerImpl<SELF extends DockerComposeContainer<SELF>> extends DockerComposeContainer<SELF> {
                    public DockerComposeContainerImpl(File... composeFiles) {
                        super(composeFiles);
                    }

                    @Override
                    public void stop() {
                        super.stop();
                        tryDeleteDir(targetDir);
                    }
                }

                testContainer = new DockerComposeContainerImpl<>(
                        new File(targetDir + "docker-compose.yml"),
                        new File(targetDir + "docker-compose.postgres.yml"),
                        new File(targetDir + "docker-compose.postgres.volumes.yml"),
                        new File(targetDir + "docker-compose.kafka.yml"))
                        .withPull(false)
                        .withLocalCompose(true)
                        .withTailChildContainers(!skipTailChildContainers)
                        .withEnv(installTb.getEnv())
                        .withEnv("LOAD_BALANCER_NAME", "")
                        .withExposedService("haproxy", 80, Wait.forHttp("/swagger-ui.html").withStartupTimeout(Duration.ofSeconds(400)))
                        .waitingFor("tb-core1", Wait.forLogMessage(TB_CORE_LOG_REGEXP, 1).withStartupTimeout(Duration.ofSeconds(400)))
                        .waitingFor("tb-core2", Wait.forLogMessage(TB_CORE_LOG_REGEXP, 1).withStartupTimeout(Duration.ofSeconds(400)))
                        .waitingFor("tb-http-transport1", Wait.forLogMessage(TRANSPORTS_LOG_REGEXP, 1).withStartupTimeout(Duration.ofSeconds(400)))
                        .waitingFor("tb-http-transport2", Wait.forLogMessage(TRANSPORTS_LOG_REGEXP, 1).withStartupTimeout(Duration.ofSeconds(400)))
                        .waitingFor("tb-mqtt-transport1", Wait.forLogMessage(TRANSPORTS_LOG_REGEXP, 1).withStartupTimeout(Duration.ofSeconds(400)))
                        .waitingFor("tb-mqtt-transport2", Wait.forLogMessage(TRANSPORTS_LOG_REGEXP, 1).withStartupTimeout(Duration.ofSeconds(400)));
            } catch (Exception e) {
                log.error("Failed to create test container", e);
                fail("Failed to create test container");
            }
        }
        return testContainer;
    }

    private static void tryDeleteDir(String targetDir) {
        try {
            log.info("Trying to delete temp dir {}", targetDir);
            FileUtils.deleteDirectory(new File(targetDir));
        } catch (IOException e) {
            log.error("Can't delete temp directory " + targetDir, e);
        }
    }

    /**
     * This workaround is actual until issue will be resolved:
     * Support container_name in docker-compose file #2472 https://github.com/testcontainers/testcontainers-java/issues/2472
     * docker-compose files which contain container_name are not supported and the creation of DockerComposeContainer fails due to IllegalStateException.
     * This has been introduced in #1151 as a quick fix for unintuitive feedback. https://github.com/testcontainers/testcontainers-java/issues/1151
     * Using the latest testcontainers and waiting for the fix...
     * */
    private static void replaceInFile(String sourceFilename, String target, String replacement, String verifyPhrase) {
        try {
            File file = new File(sourceFilename);
            String sourceContent = FileUtils.readFileToString(file, StandardCharsets.UTF_8);

            String outputContent = sourceContent.replace(target, replacement);
            assertThat(outputContent, (not(containsString(target))));
            assertThat(outputContent, (not(containsString(verifyPhrase))));

            FileUtils.writeStringToFile(file, outputContent, StandardCharsets.UTF_8);
            assertThat(FileUtils.readFileToString(file, StandardCharsets.UTF_8), is(outputContent));
        } catch (IOException e) {
            log.error("failed to update file " + sourceFilename, e);
            fail("failed to update file");
        }
    }
}
