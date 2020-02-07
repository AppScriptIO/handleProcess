import EventEmitter from 'events'
import childProcess from 'child_process'

// manage forked subprocess allowing to restart the subprocess on demand.
// Process signals - http://man7.org/linux/man-pages/man7/signal.7.html
export class ManageSubprocess extends EventEmitter {
  static subprocessList = []

  static terminateSubprocess() {
    for (let subprocess of ManageSubprocess.subprocessList) {
      if (!subprocess.killed) {
        // console.log('sending kill to subprocess ' + subprocess.pid)
        subprocess.kill('SIGTERM')
      }
    }
  }

  subprocess // child subprocess
  cliAdapterPath // the path to the cli entrypoint file, that will receive arguments from the child process fork function and pass it to the programmatic module api.
  argumentList // cached arguments to be used for running subprocesses

  constructor({ cliAdapterPath }) {
    super()
    this.cliAdapterPath = cliAdapterPath
    this.suprocess = null
  }

  runInSubprocess() {
    if (this.subprocess) this.subprocess.kill('SIGTERM')

    this.argumentList = [...(arguments.length == 0 ? this.argumentList || [] : arguments)]

    let stringifyArgs = JSON.stringify(this.argumentList) // parametrs for module to be run in subprocess.
    // running in subprocess prevents allows to control the application and terminate it when needed.
    this.subprocess = childProcess
      .fork(this.cliAdapterPath, [stringifyArgs], {
        stdio: [0, 1, 2, 'ipc'],
        execArgv: [
          // '--inspect-brk=1272', // inspect subprocess with random port to prevent conflicts with the main process in case it's inspect flag was turned on.
          '--no-lazy', // for debugging purposes will load modules sequentially
        ],
      })
      .on('message', message => {
        if (message?.status == 'ready') this.emit('ready')
      })
      .on('close', code => {
        if (code === 8) console.error('Error detected, waiting for changes.')
      })
      // childProcess.unref() // prevent parent from waiting to child process and un reference child from parent's event loop. When child process is referenced it forces the parent to wait for the child to exit before exiting itself.

    this.subprocess.on('exit', (code, signal) => console.log(`[Subprocess ${this.subprocess.pid}]: signal ${signal}, code ${code};`))

    ManageSubprocess.subprocessList.push(this.subprocess)

    return this.subprocess
  }
}

// clean up if an error goes unhandled or interrupt signal received.
// TODO: make sure the hooks for process events are not executed.
// process.exit(0) // process.abort()  // process.kill()
// process.on('exit', (code, signal) => {
//   console.log(`[Process ${process.pid}]: signal ${signal}, code ${code};`)
//   ManageSubprocess.terminateSubprocess()
// })
// process.on('close', (code, signal) => console.log(`[Process ${process.pid}]: signal ${signal}, code ${code};`))
// process.on('SIGTERM', (code, signal) => console.log(`[Process ${process.pid}]: signal ${signal}, code ${code};`))
process.on('SIGINT', (code, signal) => {
  console.log(`[Process ${process.pid}]: signal ${signal}, code ${code};`)
  ManageSubprocess.terminateSubprocess()
})
