/*
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
'use strict';

const COMPILATION_ERROR = 0;
const RUNTIME_ERROR = 1;
const TIMEOUT_ERROR = 2;
const UNRECOGNIZED = -1;

const config = require('config'),
      logger = require('../config/logger')._logger('JsInvokeMessageProcessor'),
      Utils = require('./utils'),
      JsExecutor = require('./jsExecutor');

const statFrequency = Number(config.get('script.stat_print_frequency'));
const scriptBodyTraceFrequency = Number(config.get('script.script_body_trace_frequency'));
const useSandbox = config.get('script.use_sandbox') === 'true';
const maxActiveScripts = Number(config.get('script.max_active_scripts'));
const slowQueryLogMs = Number(config.get('script.slow_query_log_ms'));
const slowQueryLogBody = config.get('script.slow_query_log_body') === 'true';

const {performance} = require('perf_hooks');

function JsInvokeMessageProcessor(producer) {
    this.producer = producer;
    this.executor = new JsExecutor(useSandbox);
    this.scriptMap = new Map();
    this.scriptIds = [];
    this.executedScriptsCounter = 0;
    this.lastStatTime = performance.now();
}

JsInvokeMessageProcessor.prototype.onJsInvokeMessage = function (message) {
    var tStart = performance.now();
    let requestId;
    let responseTopic;
    let headers;
    let request;
    let buf;
    try {
        request = JSON.parse(Buffer.from(message.data).toString('utf8'));
        headers = message.headers;
        buf = Buffer.from(headers.data['requestId']);
        requestId = Utils.UUIDFromBuffer(buf);
        buf = Buffer.from(headers.data['responseTopic']);
        responseTopic = buf.toString('utf8');

        logger.debug('[%s] Received request, responseTopic: [%s]', requestId, responseTopic);

        if (request.compileRequest) {
            this.processCompileRequest(requestId, responseTopic, headers, request.compileRequest);
        } else if (request.invokeRequest) {
            this.processInvokeRequest(requestId, responseTopic, headers, request.invokeRequest);
        } else if (request.releaseRequest) {
            this.processReleaseRequest(requestId, responseTopic, headers, request.releaseRequest);
        } else {
            logger.error('[%s] Unknown request received!', requestId);
        }

    } catch (err) {
        logger.error('[%s] Failed to process request: %s', requestId, err.message);
        logger.error(err.stack);
    }

    var tFinish = performance.now();
    var tTook = tFinish - tStart;

    if (tTook > slowQueryLogMs) {
        let functionName;
        if (request.invokeRequest) {
            try {
                buf = Buffer.from(request.invokeRequest['functionName']);
                functionName = buf.toString('utf8');
            } catch (err) {
                logger.error('[%s] Failed to read functionName from message header: %s', requestId, err.message);
                logger.error(err.stack);
            }
        }
        logger.warn('[%s] SLOW PROCESSING [%s]ms, functionName [%s]', requestId, tTook, functionName);
        if (slowQueryLogBody) {
            logger.info('Slow request body: %s', JSON.stringify(request, null, 4))
        }
    }

}

JsInvokeMessageProcessor.prototype.processCompileRequest = function (requestId, responseTopic, headers, compileRequest) {
    var scriptId = getScriptId(compileRequest);
    logger.debug('[%s] Processing compile request, scriptId: [%s]', requestId, scriptId);

    this.executor.compileScript(compileRequest.scriptBody).then(
        (script) => {
            this.cacheScript(scriptId, script);
            var compileResponse = createCompileResponse(scriptId, true);
            logger.debug('[%s] Sending success compile response, scriptId: [%s]', requestId, scriptId);
            this.sendResponse(requestId, responseTopic, headers, scriptId, compileResponse);
        },
        (err) => {
            var compileResponse = createCompileResponse(scriptId, false, COMPILATION_ERROR, err);
            logger.debug('[%s] Sending failed compile response, scriptId: [%s]', requestId, scriptId);
            this.sendResponse(requestId, responseTopic, headers, scriptId, compileResponse);
        }
    );
}

JsInvokeMessageProcessor.prototype.processInvokeRequest = function (requestId, responseTopic, headers, invokeRequest) {
    var scriptId = getScriptId(invokeRequest);
    logger.debug('[%s] Processing invoke request, scriptId: [%s]', requestId, scriptId);
    this.executedScriptsCounter++;
    if (this.executedScriptsCounter % statFrequency == 0) {
        const nowMs = performance.now();
        const msSinceLastStat = nowMs - this.lastStatTime;
        const requestsPerSec = msSinceLastStat == 0 ? statFrequency : statFrequency / msSinceLastStat * 1000;
        this.lastStatTime = nowMs;
        logger.info('STAT[%s]: requests [%s], took [%s]ms, request/s [%s]', this.executedScriptsCounter, statFrequency, msSinceLastStat, requestsPerSec);
    }

    if (this.executedScriptsCounter % scriptBodyTraceFrequency == 0) {
        logger.info('[%s] Executing script body: [%s]', scriptId, invokeRequest.scriptBody);
    }
    this.getOrCompileScript(scriptId, invokeRequest.scriptBody).then(
        (script) => {
            this.executor.executeScript(script, invokeRequest.args, invokeRequest.timeout).then(
                (result) => {
                    var invokeResponse = createInvokeResponse(result, true);
                    logger.debug('[%s] Sending success invoke response, scriptId: [%s]', requestId, scriptId);
                    this.sendResponse(requestId, responseTopic, headers, scriptId, null, invokeResponse);
                },
                (err) => {
                    var errorCode;
                    if (err.message.includes('Script execution timed out')) {
                        errorCode = TIMEOUT_ERROR;
                    } else {
                        errorCode = RUNTIME_ERROR;
                    }
                    var invokeResponse = createInvokeResponse("", false, errorCode, err);
                    logger.debug('[%s] Sending failed invoke response, scriptId: [%s], errorCode: [%s]', requestId, scriptId, errorCode);
                    this.sendResponse(requestId, responseTopic, headers, scriptId, null, invokeResponse);
                }
            )
        },
        (err) => {
            var invokeResponse = createInvokeResponse("", false, COMPILATION_ERROR, err);
            logger.debug('[%s] Sending failed invoke response, scriptId: [%s], errorCode: [%s]', requestId, scriptId, COMPILATION_ERROR);
            this.sendResponse(requestId, responseTopic, headers, scriptId, null, invokeResponse);
        }
    );
}

JsInvokeMessageProcessor.prototype.processReleaseRequest = function (requestId, responseTopic, headers, releaseRequest) {
    var scriptId = getScriptId(releaseRequest);
    logger.debug('[%s] Processing release request, scriptId: [%s]', requestId, scriptId);
    if (this.scriptMap.has(scriptId)) {
        var index = this.scriptIds.indexOf(scriptId);
        if (index > -1) {
            this.scriptIds.splice(index, 1);
        }
        this.scriptMap.delete(scriptId);
    }
    var releaseResponse = createReleaseResponse(scriptId, true);
    logger.debug('[%s] Sending success release response, scriptId: [%s]', requestId, scriptId);
    this.sendResponse(requestId, responseTopic, headers, scriptId, null, null, releaseResponse);
}

JsInvokeMessageProcessor.prototype.sendResponse = function (requestId, responseTopic, headers, scriptId, compileResponse, invokeResponse, releaseResponse) {
    var tStartSending = performance.now();
    var remoteResponse = createRemoteResponse(requestId, compileResponse, invokeResponse, releaseResponse);
    var rawResponse = Buffer.from(JSON.stringify(remoteResponse), 'utf8');
    logger.debug('[%s] Sending response to queue, scriptId: [%s]', requestId, scriptId);
    this.producer.send(responseTopic, scriptId, rawResponse, headers).then(
        () => {
            logger.debug('[%s] Response sent to queue, took [%s]ms, scriptId: [%s]', requestId, (performance.now() - tStartSending), scriptId);
        },
        (err) => {
            if (err) {
                logger.error('[%s] Failed to send response to queue: %s', requestId, err.message);
                logger.error(err.stack);
            }
        }
    );
}

JsInvokeMessageProcessor.prototype.getOrCompileScript = function (scriptId, scriptBody) {
    var self = this;
    return new Promise(function (resolve, reject) {
        const script = self.scriptMap.get(scriptId);
        if (script) {
            resolve(script);
        } else {
            self.executor.compileScript(scriptBody).then(
                (compiledScript) => {
                    self.cacheScript(scriptId, compiledScript);
                    resolve(compiledScript);
                },
                (err) => {
                    reject(err);
                }
            );
        }
    });
}

JsInvokeMessageProcessor.prototype.cacheScript = function (scriptId, script) {
    if (!this.scriptMap.has(scriptId)) {
        this.scriptIds.push(scriptId);
        while (this.scriptIds.length > maxActiveScripts) {
            logger.info('Active scripts count [%s] exceeds maximum limit [%s]', this.scriptIds.length, maxActiveScripts);
            const prevScriptId = this.scriptIds.shift();
            logger.info('Removing active script with id [%s]', prevScriptId);
            this.scriptMap.delete(prevScriptId);
        }
    }
    this.scriptMap.set(scriptId, script);
    logger.info("scriptMap size is [%s]", this.scriptMap.size);
}

function createRemoteResponse(requestId, compileResponse, invokeResponse, releaseResponse) {
    const requestIdBits = Utils.UUIDToBits(requestId);
    return {
        requestIdMSB: requestIdBits[0],
        requestIdLSB: requestIdBits[1],
        compileResponse: compileResponse,
        invokeResponse: invokeResponse,
        releaseResponse: releaseResponse
    };
}

function createCompileResponse(scriptId, success, errorCode, err) {
    const scriptIdBits = Utils.UUIDToBits(scriptId);
    return {
        errorCode: errorCode,
        success: success,
        errorDetails: parseJsErrorDetails(err),
        scriptIdMSB: scriptIdBits[0],
        scriptIdLSB: scriptIdBits[1]
    };
}

function createInvokeResponse(result, success, errorCode, err) {
    return {
        errorCode: errorCode,
        success: success,
        errorDetails: parseJsErrorDetails(err),
        result: result
    };
}

function createReleaseResponse(scriptId, success) {
    const scriptIdBits = Utils.UUIDToBits(scriptId);
    return {
        success: success,
        scriptIdMSB: scriptIdBits[0],
        scriptIdLSB: scriptIdBits[1]
    };
}

function parseJsErrorDetails(err) {
    if (!err) {
        return '';
    }
    var details = err.name + ': ' + err.message;
    if (err.stack) {
        var lines = err.stack.split('\n');
        if (lines && lines.length) {
            var line = lines[0];
            var splitted = line.split(':');
            if (splitted && splitted.length === 2) {
                if (!isNaN(splitted[1])) {
                    details += ' in at line number ' + splitted[1];
                }
            }
        }
    }
    return details;
}

function getScriptId(request) {
    return Utils.toUUIDString(request.scriptIdMSB, request.scriptIdLSB);
}

module.exports = JsInvokeMessageProcessor;
