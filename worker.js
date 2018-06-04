const got = require('got')
const delay = require('delay')
const cacache = require('cacache/en')
const {JSDOM} = require('jsdom')
const normalizeUrl = require('normalize-url')
const flatten = require('lodash/flatten')

let cachePath = './my-cache-path'

let cache = {
  get(key) {
    return cacache.get(cachePath, key).catch(() => undefined)
  },
  has(key) {
    return cacache.get(cachePath, key).then(() => true).catch(() => false)
  },
  set(key, {data, meta}) {
    return cacache.put(cachePath, key, data, meta)
  },
}

let log = process.argv.includes('-q') ? () => {} : console.log
let error = process.argv.includes('-q') ? () => {} : console.error

module.exports.process = processPage
async function processPage(url, root) {
  log('processing', url)

  let body
  if (await cache.has(url)) {
    // console.log('using cache')
    let {data, metadata={}} = await cache.get(url)
    body = data

    let isHtml = metadata.contentType && metadata.contentType.includes('text/html')
    let isError = metadata.isError
    
    if (!isHtml || isError) {
      return []
    }
  } else {
    let req = await got.get(url, {encoding: null}).catch(err => {
      error('error on', url, ':', err.message)
      return {...err.response, body: ''}
    })
    let contentType = req.headers && req.headers['content-type'] ? req.headers['content-type'] : 'x/unknown'
    let isError = req.statusCode < 200 || req.statusCode >= 300
    await delay(100)

    await cache.set(url, {
      data: req.body,
      meta: {
        contentType, 
        headers: req.headers, 
        statusCode: req.statusCode,
        isError: isError,
      },
    })
    
    body = req.body
    
    let isHtml = contentType.includes('text/html')
    if (!isHtml || isError) {
      log('not parsing non-html', url)
      return []
    }
  }
  
  body = body.toString('utf-8')

  try {
    let dom = new JSDOM(body, {url: url})
    let links = [...dom.window.document.querySelectorAll('[href]')]
      .map(el => el.href)
      .filter(href => href)

    let images = []//[...dom.window.document.querySelectorAll('[src]')]
      .map(el => el.src)
      .filter(href => href)

    // <applet archive="batik-all.jar, xml-apis.jar, xml-apis-ext.jar" code="STOBatikApplet.class" codebase="http://www.cs.stolaf.edu/wiki/extensions/Media/java/stobatik-applet-1108/" height="480" mayscript="mayscript" width="640" id="stosvg"> <param name="url" value="http://www.cs.stolaf.edu/wiki/media/9/9a/Rabbits_moonwalk.svg"> </applet>
    let javaArchives = [...dom.window.document.querySelectorAll('applet[codebase]')]
      .map(el => ({codebase: el.getAttribute('codebase'), archives: el.getAttribute('archive').split(',').map(filename => filename.trim()), code: el.getAttribute('code')}))
      .map(({codebase, archives, code}) => [...archives, code].map(file => codebase + file))

    javaArchives = flatten(javaArchives)

    let javaParams = [...dom.window.document.querySelectorAll('applet param[name=url]')]
      .map(el => {console.log(el); return el})
      .map(el => el.value)
      .filter(href => href)

    links = [...links, ...images, ...javaArchives, ...javaParams]

    dom.window.close()

    if (process.argv.includes('-v')) {
      links.forEach(l => log(l))
    }

    links = links
      .map(href => href.startsWith('/') && !href.startsWith('//') ? root + href : href)
      // .filter(url => url.startsWith('http'))
      .map(url => normalizeUrl(url))

    links = [...new Set(links)]

    return links
  } catch (err) {
    error('error on', url, ':', err.message)
    return []
  }
}

processPage(process.argv[2]).then(console.log)
