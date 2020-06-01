const fs = require('fs'),
    httpProxy = require('http-proxy'),
    servers = require('./servers'),

    proxy = httpProxy.createProxyServer(),
    httpServer = servers.createHTTPServer(),
    httpsServer = servers.createSSLServer(),

    CONFIG = {
        graphql: {
            schema: `
                type Query {
                    hello: String,
                    square(n: Int!): Int
                }
            `,
            root: {
                hello: () => 'Hello World!',
                square: args => args.n ** 2
            }
        },
        raw: {
            port: 8082
        },
        ssl_client: {
            port: 9090,
            requestCert: true,
            rejectUnauthorized: true
        },
        ssl_renegotiation: {
            port: 9091
        }
    },

    SERVERS = {
        raw: servers.createRawEchoServer(),
        bytes: servers.createBytesServer().listen(),
        redirect: servers.createRedirectServer().listen(),
        graphql: servers.createGraphQLServer(CONFIG.graphql).listen()
    };

function getTargetURL(req) {
    const path = req.url,
        target = SERVERS[req.headers['target-server']];

    if (target) {
        return target.url;
    }

    if (path === '/raw' || path.startsWith('/raw/')) {
        return SERVERS.raw.url;
    }

    if (path === '/graphql') {
        return SERVERS.graphql.url;
    }

    if ((/\/\d+\/\d{3}$/).test(path)) {
        return SERVERS.redirect.url;
    }

    if ((/^\/bytes\/\d+$/).test(path)) {
        return SERVERS.bytes.url;
    }
}

function responseHandler(server) {
    server.on('request', (req, res) => {
        const target = getTargetURL(req);

        if (target) {
            return proxy.web(req, res, { target });
        }

        res.writeHead(200, {
            'content-type': 'application/json'
        });
        res.end(JSON.stringify({
            url: req.url,
            method: req.method,
            headers: req.headers
        }));
    });
}

responseHandler(httpServer.listen(80));
responseHandler(httpsServer.listen(443));

// fixed port servers
SERVERS.raw = SERVERS.raw.listen(CONFIG.raw.port);
SERVERS.ssl_renegotiation = servers.createSSLRenegotiationServer().listen(CONFIG.ssl_renegotiation.port);
servers.createSSLServer(CONFIG.ssl_client).listen(CONFIG.ssl_client.port)
    .on('request', (req, res) => res.end('Okay!'));

// TLS servers
['1', '1.1', '1.2', '1.3'].forEach(version => {
    servers.createSSLServer({
        maxVersion: 'TLSv' + version,
        minVersion: 'TLSv' + version
    }).listen(7000 + parseInt(version.split('.').join('')))
    .on('request', (req, res) => res.end('Okay!'));
});
