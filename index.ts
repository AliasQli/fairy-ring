import { Cli, Bridge, AppServiceRegistration } from "matrix-appservice-bridge";
import { Client } from "onebot-client";

const config = require("./config.json");

let bridge: Bridge;

const client = new Client(config.qq.id, config.qq.onebot);

for (let from of config.forward.qq) {
    for (let to of from.to) {
        if (to.type === "matrix") {
            client.pickGroup(from.id).on("message", (event) => {
                if (event.sender.user_id !== config.qq.id) {
                    const intent = bridge.getIntent(config.matrix.prefix + event.sender.user_id.toString() + ":" + config.matrix.appservice.domain);
                    intent.sendMessage(to.id, undefined);
                }
            })
        } else {
            console.warn("Unsupported platform: %s", to.type);
        }
    }
}

const cli = new Cli({
    registrationPath: config.matrix.appservice.registration,
    generateRegistration: function (reg, callback) {
        reg.setId(AppServiceRegistration.generateToken());
        reg.setHomeserverToken(AppServiceRegistration.generateToken());
        reg.setAppServiceToken(AppServiceRegistration.generateToken());
        reg.setSenderLocalpart("fairy_ring");
        reg.addRegexPattern("users", config.matrix.prefix, true);
        callback(reg);
    },
    run: function (port) {
        bridge = new Bridge({
            ...config.matrix.appservice,

            controller: {
                onUserQuery: function (queriedUser) {
                    return {}; // auto-provision users with no additonal data
                },

                onEvent: function (request, context) {
                    const event = request.getData();
                    if (event.type !== "m.room.message" || !event.content) {
                        return;
                    }
                    for (let from of config.forward.matrix) {
                        if (from.id !== event.room_id) {
                            continue;
                        }
                        for (let to of from.to) {
                            if (to.type === "qq") {
                                client.pickGroup(to.id).sendMsg(undefined);
                            } else {
                                console.warn("Unsupported platform: %s", to.type);
                            }
                        }
                    }
                }
            }
        });
        console.log("Matrix-side listening on port %s", port);
        bridge.run(port as number);
    }
});

cli.run();
client.start();
