const RunQueue = require('run-queue')
const {JSDOM} = require('jsdom')
const {default: Worker} = require('jest-worker')
const delay = require('delay')

let worker = new Worker(require.resolve('./worker'), {exposedMethods: ['process']})
let queue = new RunQueue({maxConcurrency: 6})

let pages = new Set()

let log = process.argv.includes('-q') ? () => {} : console.log
let error = process.argv.includes('-q') ? () => {} : console.error

let start = Date.now()

async function processPage(url) {
  if (pages.has(url)) {
    log('skipping already processed', url)
    return
  }

  let regex = /.*cs\.stolaf\.edu\/wiki/
  if (!regex.test(url)) {
    log('skipping non-stolaf site', url)
    pages.add(url)
    return
  }

  log('processing', url)
  pages.add(url)

  let elapsed = ((Date.now() - start) / 1000).toFixed(2)
  // process.stdout.write(`\r${pages.size} seen; ${queue.queued} queued; ${elapsed}s elapsed`)
  console.log(`\r${pages.size} seen; ${queue.queued} queued; ${elapsed}s elapsed`)

  let links = await worker.process(url, 'http://www.cs.stolaf.edu')
  links = links.filter(url => !pages.has(url))
  links = links.filter(url => regex.test(url))

  links.forEach(url => queue.add(1, processPage, [url]))
}

queue.add(1, processPage, ['http://www.cs.stolaf.edu/wiki/index.php/Main_Page'])
queue.run().then(() => worker.end())
