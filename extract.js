const cacache = require('cacache')
const path = require('path')
const slashEscape = require('slash-escape')
const humanizeUrl = require('humanize-url')
const cp = require('cp-file')
const fs = require('graceful-fs')
const mkdir = require('make-dir')

async function extractItem({key, integrity, path: origPath, size, metadata}) {
  // console.log(key)
  // fast handling of over-long filenames
  if (key.includes('google.com') || key.includes('ezproxy')) {
    return
  }
  let newPath = humanizeUrl(key)
  let query
  [newPath, query=''] = newPath.split('?')
  let dirNames = newPath.split('/')
  let fileName = ''
  if (dirNames.length > 1 && dirNames[dirNames.length - 1].includes('.')) {
    fileName = dirNames.pop()
  }
  if (dirNames[dirNames.length - 1] === 'index') {
    fileName = dirNames.pop()
  }
  if (newPath.endsWith('/')) {
    fileName = 'index'
  }
  if (query) {
    fileName = fileName + '?' + query
  }
  if (fileName === '?') {
    fileName = 'index'
  }
  if (!fileName) {
    fileName = 'index'
  }
  fileName = slashEscape.escape(fileName)
  let dirName = path.join('cache', ...dirNames)
  destPath = path.join(dirName, fileName)
  // console.log(key, `\n  dirname=${dirName} filename=${fileName}`, '\n  =>', destPath)
  await mkdir(dirName)
  // cacache.get.stream('./my-cache-path', key).pipe(fs.createWriteStream(destPath))
  let {data} = await cacache.get('./my-cache-path', key)
  try {
    fs.writeFileSync(destPath, data)
  } catch (err) {
    console.warn(err.message)
  }
}

function* enumerate(iter) {
  let i = 0
  for (let item of iter) {
    yield [i, item]
    i += 1
  }
}

async function main() {
  // cacache.ls.stream('./my-cache-path').on('data', extractItem)
  let items = Object.values(await cacache.ls('./my-cache-path'))
  for (let [i, item] of enumerate(items)) {
    process.stdout.write(`\r${i} of ${items.length} : ${item.key.substr(0, 80)}`)
    await extractItem(item)
  }
}

main()
