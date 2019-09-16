#!/usr/bin/env ./node_modules/.bin/babel-node
"use stric";

// global declarations
const icons = "picon.tar.bz2",
  origDefault = "192.168.1.204:22",
  destDefault = "192.168.1.222:22",
  noCkech = "-oStrictHostKeyChecking=no"; // to avoid check different host dynIP

// import required libraries
const exec = require("child_process").exec;
const argv = require("yargs")
  .usage("Usage: $0 --orig [ip]:[port] --dest [ip]:[port] --port [port]")
  .default({ orig: origDefault, port: "22" })
  .demand(["orig", "dest"])
  .showHelpOnFail(true).argv;
const term = require("terminal-kit").terminal;
const portscanner = require("portscanner"),
  clear = require("clear"),
  figlet = require("figlet"),
  CLI = require("clui"),
  clc = require("cli-color"),
  Line = CLI.Line,
  LineBuffer = CLI.LineBuffer,
  Spinner = CLI.Spinner;

const DOWN = ["DOWN", "red"],
  NO = ["NO", "red"],
  UP = ["UP", "bgGreen"],
  YES = ["YES", "bgGreen"];

// To indicate a message about what it is doing
var spin = new Spinner("");
spin.start();

//// Set an array with the destination target
function setDest(dest, users) {
  let target = Array.isArray(dest) ? dest : dest.split(" ");

  return target
    .map(host => {
      let [ip, port] = host.split(":"),
        username = "";
      if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(host)) {
        // NO IP style target
        username = ip;
        ip = users[username] || ip;
      }
      if (ip) {
        return {
          host: ip,
          port: port || `${argv.port}`,
          state: DOWN,
          channels: NO,
          iconsUp: NO,
          iconsSet: NO,
          user: username
        };
      }
    })
    .filter(host => host);
}

//// Execute a shell linux command and return its result wrapped in a Promise
function command(sentence) {
  return new Promise(function(resolve, reject) {
    try {
      exec(sentence, { maxBuffer: 1024 * 500 }, function(err, stdout, stderr) {
        if (err) reject(err);
        resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
}

//// To check a host is available
function checkHost({ host, port }) {
  return new Promise((resolve, reject) => {
    try {
      portscanner.checkPortStatus(port, host, function(error, status) {
        if (error) reject(error);
        status === "open" ? resolve() : reject();
      });
    } catch (e) {
      reject(e);
    }
  });
}

//// It reads the users.html page to get each user IP
async function getUsersIPs(user) {
  await command(`curl http://192.168.1.204:8181/users.html -O --user ${user}`);
  const userlines = require("fs")
    .readFileSync("./users.html")
    .toString()
    .match(/<tr>.+<\/tr>/g);

  return userlines.reduce((users, line, i) => {
    const user = line.match(
      /<tr><td>-?\d{1,3}<\/td><td>([a-zA-Z0-0]+)<\/td>.+<td>(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})<\/td>.+<\/tr>/
    );
    if (user) users[user[1]] = user[2];
    return users;
  }, {});
}

async function main() {
  // It crawls into the users html page taking users/IP if user admin:passwd is supplied
  let users = {};
  if (argv.user) {
    users = await getUsersIPs(argv.user);
    // console.log(`Usuarios leíos: ${JSON.stringify(users, null, 2)}`);
  }

  // Looking for SSH ports and host isolation
  const [hostOrig, pOrig] = argv.orig.split(":");
  let orig = {
    host: hostOrig,
    port: pOrig || `${argv.port}`,
    state: DOWN,
    channels: NO,
    icons: NO
  };
  let dest = setDest(argv.dest, users); // Every destination host into an array

  // Clears screen and welcome message
  clear();
  term.blue(figlet.textSync("DEC-UPDATE", { horizontalLayout: "full" }));
  draw(orig, dest, `Connecting ${orig.host} on port ${orig.port}`);

  checkHost(orig)
    .then(() => {
      orig.state = UP;
      draw(orig, dest, `Retrieving channels from ${orig.host}`);
      // Getting the channel list from the origin host
      return command(
        `ssh ${noCkech} -p ${orig.port} root@${orig.host} "tar cf - /etc/enigma2" | tar xvf -`
      );
    })
    .then(() => {
      orig.channels = YES;
      draw(orig, dest, `Getting the icons pack from ${orig.host}`);
      // Retrieving the icons pack
      return command(
        `ssh ${noCkech} -p ${orig.port} root@${orig.host} "cd /hdd && tar cf - picon" | bzip2 - > ${icons}`
      );
    })
    .then(() => {
      orig.icons = YES;
      draw(orig, dest);

      // Now, we can do the broadcasting to each target
      return Promise.all(
        dest.map(target => {
          return new Promise(resolve => {
            checkHost(target)
              .then(state => {
                target.state = UP;
                draw(orig, dest, `Uploading channels to ${target.host}`);
                // Uploading channels list
                return command(
                  `scp ${noCkech} -P ${target.port} \`find etc/ | egrep 'lamedb|list|bouquet|satellites|.tv|.radio'\` root@${target.host}:/etc/enigma2/`
                );
              })
              .then(() => {
                target.channels = YES;
                draw(orig, dest, `Uploading icons pack to ${target.host}`);
                // Uploading icons
                return command(
                  `scp ${noCkech} -P ${target.port} -r ./${icons} root@${target.host}:`
                );
              })
              .then(() => {
                target.iconsUp = YES;
                draw(orig, dest, `Extracting icons into the ${target.host}`);
                // Extracting icons
                return command(
                  `ssh ${noCkech} -p ${target.port} root@${target.host} "tar xjf ${icons} -C /usr/share/enigma2/ && rm -rf ${icons}"`
                );
              })
              .then(() => {
                target.iconsSet = YES;
                draw(orig, dest);
                resolve();
              })
              .catch(() => resolve());
          });
        })
      );
    })
    .catch(err => {
      spin.stop();
      term.bold(`\n\Aborted process.\n`);
      console.log(err);
    })
    .finally(() => {
      spin.stop();
      term.white(`\n\nErasing temporal files... `);
      command(`rm -rf ./etc ./${icons}`);
      term.bold(`Bye!\n\n`);
    });
}

//// It draws on the screen
function draw(orig, dest, spinMsg = "") {
  const outputBuffer = new LineBuffer({
    x: 0,
    y: 7,
    width: "console",
    height: "console"
  });
  const blankLine = () => new Line(outputBuffer).fill().store();

  new Line(outputBuffer)
    .padding(1)
    .column("Origin Host", 25, [clc.magenta])
    .column("Port", 6, [clc.magenta])
    .column("UP/DOWN", 10, [clc.magenta])
    .column("Channel list retrieved", 25, [clc.magenta])
    .column("Icons pack retrieved", 20, [clc.magenta])
    .fill()
    .store();
  blankLine();

  const origin = new Line(outputBuffer)
    .padding(1)
    .column(orig.host, 26, [clc.green])
    .column(orig.port, 7, [clc.green])
    .column(orig.state[0], 16, [clc[orig.state[1]]])
    .column(orig.channels[0], 25, [clc[orig.channels[1]]])
    .column(orig.icons[0], 3, [clc[orig.icons[1]]])
    .fill()
    .store();
  blankLine();
  blankLine();

  const { state, channels, icons } = orig;
  if (state === UP && channels === YES && icons === YES) {
    new Line(outputBuffer)
      .padding(1)
      .column("Target IP Host", 22, [clc.magenta])
      .column("Target Port", 16, [clc.magenta])
      .column("UP/DOWN", 10, [clc.magenta])
      .column("Channels configured", 22, [clc.magenta])
      .column("Icons uploaded", 18, [clc.magenta])
      .column("Icons established", 20, [clc.magenta])
      .fill()
      .store();
    blankLine();

    dest.map(target => {
      const host = target.user
        ? `${target.host} (${target.user})`
        : target.host;
      new Line(outputBuffer)
        .padding(1)
        .column(host, 26, [clc.blue])
        .column(target.port, 14, [clc.blue])
        .column(target.state[0], 16, [clc[target.state[1]]])
        .column(target.channels[0], 20, [clc[target.channels[1]]])
        .column(target.iconsUp[0], 18, [clc[target.iconsUp[1]]])
        .column(target.iconsSet[0], 20, [clc[target.iconsSet[1]]])
        .fill()
        .store();
    });
    blankLine();
  }

  outputBuffer.output();
  spin.message(spinMsg);
}

main();
