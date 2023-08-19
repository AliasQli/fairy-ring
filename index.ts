import { Cli, Bridge, AppServiceRegistration } from "matrix-appservice-bridge";
import { Client, GroupMessage } from "onebot-client";

const config = require("./config.json");

let bridge: Bridge;

const client = new Client(config.qq.id, config.qq.onebot);

function qqNumberToMxId(id: number): string {
    // TODO
    // if (id === config.qq.id) {
    return config.matrix.prefix + id.toString() + ":" + config.matrix.appservice.domain;
}

for (let from of config.forward.qq) {
    for (let to of from.to) {
        if (to.type === "matrix") {
            client.pickGroup(from.id).on("message", (event) => {
                if (event.sender.user_id !== config.qq.id) {
                    const intent = bridge.getIntent(qqNumberToMxId(event.sender.user_id));

                    let content: Record<string, unknown> = { msgtype: "m.text", format: "org.matrix.custom.html", body: "", formatted_body: "" };
                    if (typeof event.source !== "undefined") {
                        const msg = event.source.message as string;
                        const replied = qqNumberToMxId(event.source.user_id);
                        content.body += `> <${replied}>: ${msg}"\n\n`;
                        content.formatted_body += `<mx-reply><blockquote><a href=\"https://matrix.to/#/${to.id}\">In reply to</a> <a href=\"https://matrix.to/#/${replied}\">${replied}</a><br />${msg}</blockquote></mx-reply>`;
                    }
                    for (let elem of event.message) {
                        switch (elem.type) {
                            case "text": {
                                content.body += elem.text;
                                content.formatted_body += elem.text;
                                break;
                            }
                            case "at": {
                                if (elem.qq === "all") {
                                    content.body += `@room `;
                                    content.formatted_body += `@room `;
                                } else {
                                    const user = qqNumberToMxId(elem.qq);
                                    content.body += `${user}`;
                                    content.formatted_body += `<a href=\"https://matrix.to/#/${user}\">${user}</a>`;
                                }
                                break;
                            }
                            default: continue;
                        }
                    }
                    intent.sendMessage(to.id, content);
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
                                client.pickGroup(to.id).sendMsg(event.sender + ":" + event.content.body as string);
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
