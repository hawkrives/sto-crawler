const RunQueue = require('run-queue')
const {JSDOM} = require('jsdom')
const {default: Worker} = require('jest-worker')
const delay = require('delay')

let worker = new Worker(require.resolve('./worker'), {exposedMethods: ['process']})
let queue = new RunQueue({maxConcurrency: 6})

let pages = new Set()
let blacklist = [
  /[/]wp-json/,
  /.*\.(jpe?g|png|css|svg|js|xml|php|pdf)/,
  /[/]files/,
  /[/]tag/,
  /[?].*page=/,
  /wp\.stolaf\.edu\/(calendar|news)/,
  /wp\.stolaf\.edu.*wp\.stolaf\.edu/,
]

let log = process.argv.includes('-q') ? () => {} : console.log
let error = process.argv.includes('-q') ? () => {} : console.error

let start = Date.now()

async function processPage(url) {
  if (pages.has(url)) {
    log('skipping already processed', url)
    return
  }

  let regex = /\/wp\.stolaf\.edu/
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

  let links = await worker.process(url, 'https://wp.stolaf.edu')
  links = links.filter(url => !pages.has(url))
  links = links.filter(url => regex.test(url))
  links = links.filter(url => 
    !blacklist.some(exp => exp.test(url)))

  links.forEach(url => queue.add(1, processPage, [url]))
}

process.argv
  .slice(2)
  .filter(arg => !arg.startsWith('-'))
  .forEach(url => {
    queue.add(1, processPage, [url])
  })

queue.run().then(() => worker.end())
