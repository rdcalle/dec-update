#!/usr/bin/env babel-node
'use stric'

// global declarations
const icons       = "picon.tar.bz2",
      origDefault = "192.168.1.204:22",
      destDefault = "192.168.1.222:22";
const DOWN  = ['DOWN', 'red'],
      NO    = ['NO', 'red'],
      UP    = ['UP', 'green'],
      YES   = ['YES', 'green'];


// import required libraries
const exec = require('child_process').exec;
const argv = require('yargs')
      .usage('Uso: $0 --orig [ip]:[puerto] --dest [ip]:[puerto]')
      .default({'orig': origDefault, 'dest': destDefault})
      .demand(['orig', 'dest'])
      .showHelpOnFail(true)
      .argv;
const term        = require( 'terminal-kit' ).terminal;
const portscanner = require('portscanner');
const clear       = require('clear')
      figlet      = require('figlet')
      CLI         = require('clui'),
      clc         = require('cli-color'),
      Line        = CLI.Line,
      LineBuffer  = CLI.LineBuffer;


//// Set an array with the destination target
function setDest(dest) {
  let target = Array.isArray(dest) ? dest : dest.split(" ");

  return target
    .map(host => {
      if ( /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(host) ) {
        const [ ip, port ] = host.split(':');
        return {
          host: ip,
          port: port || '22',
          state: DOWN,
          channels: NO,
          iconsUp: NO,
          iconsSet: NO
        }
      }
    })
    .filter(host => host);
}

//// Execute a shell linux command and return its result wrapped in a Promise
function command(sentence, msg) {
  return new Promise(function(resolve, reject) {
    try {
      exec(sentence, {maxBuffer: 1024 * 500}, function(err, stdout, stderr) {
        if (err) {
          reject(err)
        }
        term.cyan(msg || stdout);
        resolve();
      });
    } catch(e) {
      reject(e);
    }
  });
}

//// It manages a list of Promises executed in parallel
function commands(list) {
  return Promise.all(list.reduce((prev, curr) => {
    prev.push(command(curr[0], curr[1]));
    return prev;
  }, []));
}

//// linux commands to be executed
async function execute() {
  const origTimeLbl = '    Tiempo empleado';
  const noCkech = '-oStrictHostKeyChecking=no'; // to avoid check different host dynIP
  try {
    // First, we get channel list and picons from the origin decoder
    console.time(origTimeLbl);
    term.bold(`\n -- Obteniendo los archivos necesarios de `).bgBlue(`${argv.orig}:${pOrig}\n`);
    await commands([
      [
        `ssh ${noCkech} -p ${pOrig} root@${argv.orig} "tar cf - /etc/enigma2" | tar xvf -`,
        `  - Obtenida configuración de la lista de canales -> ./etc/enigma2\n`
      ]
      // ],
      // [
      //   `ssh ${noCkech} -p ${pOrig} root@${argv.orig} "cd /hdd && tar cf - picon" | bzip2 - > ${icons}`,
      //   `  - Obtenidos iconos de los canales -> ./${icons}\n`
      // ]
    ]);
    console.timeEnd(origTimeLbl);

    // Then, we send them to the destination decoder
    // term.bold(`\n -- Subiendo los archivos a `).bgMagenta(`${argv.dest}:${pDest}`)(` (canales e iconos)\n`);
    // await commands([
    //   [
    //     `scp ${noCkech} -P ${pDest} \`find etc/ | egrep 'lamedb|list|bouquet|satellites'\` root@${argv.dest}:/etc/enigma2/`,
    //     `  - Subida la configuración de los canales\n`
    //   ],
    //   [
    //     `scp ${noCkech} -P ${pDest} -r ./${icons} root@${argv.dest}:`,
    //     `  - Subidos los iconos actualizados (extrayendo en remoto... esto tardará un pelín)\n`
    //   ]
    // ]);
    // And it extracts picon file
    // await command(
    //   `ssh ${noCkech} -p ${pDest} root@${argv.dest} "tar xjf ${icons} -C /usr/share/enigma2/ && rm -rf ${icons}"`,
    //   `  - Extraídos ya todos los ficheros de los iconos de los canales\n`
    // );
    // Finally, we remove the temporal dirs
    await command(
      `rm -rf ./etc ./${icons}`,
      `\n -- Borrados todos ficheros temporales`
    );
    term.bgGreen.bold("\n¡Proceso finalizado correctamente!\n");
  }
  catch(err) {
    console.log(`${err}`);
  }
}

//// To check a host is available
function checkHost({host, port}) {
  return new Promise((resolve, reject) => {
    try {
      portscanner.checkPortStatus(port, host, function(error, status) {
        if (error) reject(error);
        status === 'open' ? resolve() : reject()
      });
    } catch(e) {
      reject(e);
    }
  })
}

function main() {
  // Looking for SSH ports and host isolation
  const [ hostOrig, pOrig ] = argv.orig.split(':');
  let orig = {
    host:     hostOrig,
    port:     pOrig || '22',
    state:    DOWN,
    channels: NO,
    icons:    NO
   }
  let dest = setDest(argv.dest); // Every destination host into an array

  // Clears screen and welcome message
  clear();
  term.blue(figlet.textSync('DEC-UPDATE', { horizontalLayout: 'full' }));
  draw(orig, dest);

  checkHost(orig).then(() => {
    orig.state = UP;
    draw(orig, dest);
    dest.map(host => {
      checkHost(host)
      .then(() => UP)
      .catch(() => DOWN)
      .then((state) => {
        host.state = state;
        draw(orig, dest);
      });
    });
  });
  // .then(() => execute())
  // .catch((err) => {
  //   console.log(err);
  //   return false;
  // });
}

//// It draws on the screen
function draw(orig, dest) {
  const outputBuffer = new LineBuffer({
    x: 0,
    y: 7,
    width: 'console',
    height: 'console'
  });
  const blankLine = () => new Line(outputBuffer)
    .fill()
    .store();

  new Line(outputBuffer)
    .padding(1)
    .column('Origin Host', 30, [clc.magenta])
    .column('UP/DOWN', 10, [clc.magenta])
    .column('Channel list retrieved', 25, [clc.magenta])
    .column('Icons pack retrieved', 20, [clc.magenta])
    .fill()
    .store();
  blankLine();

  new Line(outputBuffer)
    .padding(1)
    .column(`${orig.host}:${orig.port}`, 32)
    .column(orig.state[0], 16, [clc[orig.state[1]]])
    .column(orig.channels[0], 25, [clc[orig.channels[1]]])
    .column(orig.icons[0], 3, [clc[orig.icons[1]]])
    .fill()
    .store();
  blankLine();
  blankLine();

  new Line(outputBuffer)
    .padding(1)
    .column('Target IP Host', 30, [clc.magenta])
    .column('UP/DOWN', 10, [clc.magenta])
    .column('Channels configured', 22, [clc.magenta])
    .column('Icons uploaded', 18, [clc.magenta])
    .column('Icons established', 20, [clc.magenta])
    .fill()
    .store();
  blankLine();

  dest.map(target => {
    new Line(outputBuffer)
      .padding(1)
      .column(`${target.host}:${target.port}`, 32)
      .column(target.state[0], 16, [clc[target.state[1]]])
      .column(target.channels[0], 20, [clc[target.channels[1]]])
      .column(target.iconsUp[0], 18, [clc[target.iconsUp[1]]])
      .column(target.iconsSet[0], 20, [clc[target.iconsSet[1]]])
      .fill()
      .store();
  })
  blankLine();

  outputBuffer.output();
}

main();
