const { readFileSync } = require("fs");
const { resolve } = require("path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const { default: withReflection } = require("grpc-node-server-reflection");

const ROOT_CERT = readFileSync(resolve(__dirname, "../certificates/ca.pem"));
const PRIVATE_KEY = readFileSync(resolve(__dirname, "../certificates/server-key.pem"));
const CERT_CHAIN = readFileSync(resolve(__dirname, "../certificates/server-crt.pem"));
const PROTO = grpc.loadPackageDefinition(
    protoLoader.loadSync(resolve(__dirname, "./hello.proto"), {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
    })
);

async function spawnHelloServer(port, isSecure, checkClientCerts) {
    const server = withReflection(new grpc.Server());

    server.addService(PROTO.hello.HelloService.service, {
        SayHello: (call, callback) => {
            callback(null, { reply: call.request.greeting || "noname" });
        },

        LotsOfReplies: (call) => {
            call.write({
                reply: "Hello " + (call.request.greeting || "noname") + " - 1",
            });
            call.write({
                reply: "Hello " + (call.request.greeting || "noname") + " - 2",
            });
            call.write({
                reply: "Hello " + (call.request.greeting || "noname") + " - 3",
            });
            call.end();
        },

        LotsOfGreetings: (call, callback) => {
            let response = "";
            call.on("data", function ({ greeting }) {
                response += `Hello ${greeting} - `;
            });
            call.on("end", function () {
                callback(null, {
                    reply: response,
                });
            });
        },

        BidiHello: (call) => {
            call.on("data", function ({ greeting }) {
                call.write({ reply: greeting });
            });
            call.on("end", function () {
                call.end();
            });
        },
    });

    const credentials = isSecure
        ? grpc.ServerCredentials.createSsl(
              ROOT_CERT,
              [
                  {
                      private_key: PRIVATE_KEY,
                      cert_chain: CERT_CHAIN,
                  },
              ],
              checkClientCerts === true
          )
        : grpc.ServerCredentials.createInsecure();

    return new Promise((resolve, reject) => {
        server.bindAsync(`localhost:${port}`, credentials, (error) => {
            if (error) {
                return reject(error);
            }

            server.start();
            resolve(server);
        });
    });
}

Promise.all([
    spawnHelloServer(5000, false),
    spawnHelloServer(5001, true),
    spawnHelloServer(5002, true, true),
])
    .then(() => {
        console.log("insecure      : grpc://localhost:5000");
        console.log("secure        : grpc://localhost:5001");
        console.log("secure (mTLS) : grpc://localhost:5002");
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
