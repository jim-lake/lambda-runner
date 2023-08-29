#!/usr/bin/env node

const { Buffer } = require('node:buffer');
const crypto = require('node:crypto');
const http = require('node:http');
const path = require('node:path');
const querystring = require('node:querystring');
const { DateTime } = require('luxon');

exports.enableCors = enableCors;
exports.run = run;

let g_corsOptions = false;
let g_corsResponse = false;

const DEFAULT_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': '*',
  'Access-Control-Max-Age': '3600',
};
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  if (process.argv[3] === '--cors') {
    enableCors();
  }

  const { handler } = require(path.join(process.env.PWD, process.argv[2]));
  run(PORT, handler);
}
function enableCors(cors) {
  g_corsOptions = cors || DEFAULT_CORS;
  g_corsResponse = {};
  Object.keys(g_corsOptions).forEach((key) => {
    const k = key.toLowerCase();
    if (
      k === 'access-control-allow-origin' ||
      k === 'access-control-expose-headers'
    ) {
      g_corsResponse[key] = g_corsOptions[key];
    }
  });
}

function run(port, handler) {
  const server = http.createServer(_listener);
  server.listen(port, function () {
    console.log('Server listening on port:', port);
  });

  function _listener(req, res) {
    let body;
    req.on('data', function (chunk) {
      if (body === undefined) {
        body = chunk;
      } else if (Buffer.isBuffer(chunk)) {
        body = Buffer.concat([body, chunk]);
      } else {
        body += chunk;
      }
    });
    req.on('end', function () {
      const has_origin = req.headers.origin;
      const has_cors_method = req.headers['access-control-request-method'];
      if (has_origin && has_cors_method && req.method === 'OPTIONS') {
        _optionsCors(req, res);
      } else {
        const [rawPath, rawQueryString] = req.url.split('?');
        const dt = DateTime.now();
        const event = {
          version: '2.0',
          routeKey: '$default',
          rawPath,
          rawQueryString,
          headers: req.headers,
          requestContext: {
            accountId: 'anonymous',
            apiId: 'placeholder',
            domainName: 'placeholder.lambda-url.us-east-1.on.aws',
            domainPrefix: 'placeholder',
            http: {
              method: req.method,
              path: rawPath,
              protocol: 'HTTP/' + req.httpVersion,
              sourceIp: req.socket.remoteAddress,
              userAgent: req.headers?.['user-agent'],
            },
            requestId: crypto.randomUUID(),
            routeKey: '$default',
            stage: '$default',
            time: dt.toFormat('d/MMM/yyyy:TT ZZZ'),
            timeEpoch: dt.toMillis(),
          },
          isBase64Encoded: false,
        };
        if (rawQueryString) {
          event.queryStringParameters = querystring.parse(rawQueryString);
        }
        if (req.headers.cookie) {
          event.cookies = req.headers.cookie.split(';').map((s) => s.trim());
        }
        const type = req.headers['content-type'];

        if (body && (type === 'text/plain' || type === 'application/json')) {
          event.body = String(body);
        } else if (Buffer.isBuffer(body) && body.length > 0) {
          event.body = body.toString('base64');
          event.isBase64Encoded = true;
        } else if (body) {
          event.body = body;
        }

        handler(event).then(
          (response) => {
            let res_body;
            if (response.body && response.isBase64Encoded) {
              res_body = Buffer.from(response.body, 'base64');
            } else if (response.body !== undefined) {
              if (!response.headers?.['content-type']) {
                response.headers = response.headers || {};
                response.headers['content-type'] = 'application/json';
              }
              if (typeof response.body === 'object') {
                res_body = JSON.stringify(response.body);
              } else {
                res_body = String(response.body);
              }
            }
            let headers = response.headers ?? {};
            if (has_origin && g_corsResponse) {
              headers = _mergeHeaders(headers, g_corsResponse);
            }
            console.log(headers);
            res.writeHead(response.statusCode ?? 200, headers);
            res.end(res_body);
          },
          (err) => {
            res.writeHead(500);
            res.end(err?.stack ? String(err.stack) : String(err));
          }
        );
      }
    });
    req.on('err', function (err) {
      console.error(err);
    });
  }
}
function _optionsCors(req, res) {
  res.writeHead(200, g_corsOptions);
  res.end();
}
function _mergeHeaders(old_obj, new_obj) {
  const ret = Object.assign({}, old_obj);
  Object.keys(new_obj).forEach((key) => {
    const value = new_obj[key];
    if (!ret[key]) {
      ret[key] = value;
    } else if (Array.isArray(ret[key])) {
      ret[key].push(value);
    } else {
      ret[key] = [ret[key], value];
    }
  });
  return ret;
}
