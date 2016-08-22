#!/usr/bin/env babel-node
'use stric'

// declarations
const icons = "picon.tar.bz2";
const ipOrig = "192.168.1.204"
const ipDest = "192.168.1.222";

// import required libraries
const exec = require('child_process').exec;
const argv = require('yargs')
      .usage('Uso: $0 --orig [ip] --pOrig [num] --dest [ip] --pDest [num]')
      .default({'orig': ipOrig, 'dest': ipDest})
      .demand(['orig', 'dest'])
      .showHelpOnFail(true)
      .argv;
const portscanner = require('portscanner');
const term = require( 'terminal-kit' ).terminal ;

// Looking for SSH ports
let pOrig = argv.pOrig,
    pDest = argv.pDest;
if (!pOrig) { pOrig = ipOrig === argv.orig ? 22 : 6922 }
if (!pDest) { pDest = ipDest === argv.dest ? 22 : 6922}

// Execute a shell linux command and return its result wrapped in a Promise
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

// It manages a list of Promises executed in parallel
function commands(list) {
  return Promise.all(list.reduce((prev, curr) => {
    prev.push(command(curr[0], curr[1]));
    return prev;
  }, []));
}

// linux commands to be executed
async function execute() {
  const origTimeLbl = '    Tiempo empleado';
  try {
    // First, we get channel list and picons from the origin decoder
    console.time(origTimeLbl);
    term.bold(`\n -- Obteniendo los archivos necesarios de `).bgBlue(`${argv.orig}:${pOrig}\n`);
    await commands([
      [
        `ssh -p ${pOrig} root@${argv.orig} "tar cf - /etc/enigma2" | tar xvf -`,
        `  - Obtenida configuración de la lista de canales -> ./etc/enigma2\n`
      ],
      [
        `ssh -p ${pOrig} root@${argv.orig} "cd /hdd && tar cf - picon" | bzip2 - > ${icons}`,
        `  - Obtenidos iconos de los canales -> ./${icons}\n`
      ]
    ]);
    console.timeEnd(origTimeLbl);

    // Then, we send them to the destination decoder
    term.bold(`\n -- Subiendo los archivos a `).bgMagenta(`${argv.dest}:${pDest}`)(` (canales e iconos)\n`);
    await commands([
      [
        `scp -P ${pDest} \`find etc/ | egrep 'lamedb|list|bouquet|satellites'\` root@${argv.dest}:/etc/enigma2/`,
        `  - Subida la configuración de los canales\n`
      ],
      [
        `scp -P ${pDest} -r ./${icons} root@${argv.dest}:`,
        `  - Subidos los iconos actualizados (extrayendo en remoto... esto tardará un pelín)\n`
      ]
    ]);
    // And it extracts picon file
    await command(
      `ssh -p ${pDest} root@${argv.dest} "tar xjf ${icons} -C /usr/share/enigma2/ && rm -rf ${icons}"`,
      `  - Extraídos ya todos los ficheros de los iconos de los canales\n`
    );
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

function checkHost(ip, port) {
  return new Promise((resolve, reject) => {
    try {
      portscanner.checkPortStatus(port, ip, function(error, status) {
        if (error) reject(error);
        if (status === 'open') resolve()
        else reject(`\nHost ${ip}:${port} no responde. No puedo continuar.\n`);
      });
    } catch(e) {
      reject(e);
    }
  })
}

function main() {
  Promise.all([
    checkHost(argv.orig, pOrig),
    checkHost(argv.dest, pDest)
  ])
  .then(() => execute())
  .catch((err) => {
    console.log(err);
    return false;
  });
}

main();
