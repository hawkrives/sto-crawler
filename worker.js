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
  set(key, value) {
    return cacache.put(cachePath, key, value)
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
    let {data, metadata} = await cache.get(url)
    if (metadata && metadata.contentType && !metadata.contentType.includes('text/html')) {
      return []
    }
    body = data.toString('utf-8')
  } else {
    let headers = {
      cookie: 'Cookie: wiki_dbUserID=802; wiki_dbUserName=Rives; wiki_db_session=rgj4ffn48uksd9ti7dt3jgcoq3; _ga=GA1.2.1877808590.1517846158; lc_sso7639251=1526415638741; lc_sso8994300=1526325452794; lc_ssoundefined=1526047315284; __lc.visitor_id.7639251=S1519228459.34cd926bcb; __lc.visitor_id.8994300=S1518474387.f3502665f6',
    }
    let req = await got.get(url, {encoding: null, headers}).catch(err => {
      error('error on', url, ':', err.message)
      return {body: '', headers: {'content-type': 'x/unknown'}}
    })
    let contentType = req.headers && req.headers['content-type'] ? req.headers['content-type'] : 'x/unknown'
    await delay(100)
    body = req.body
    await cache.set(url, body, {metadata: {contentType}})
    let isHtml = contentType.includes('text/html')
    if (!isHtml) {
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

    let images = [...dom.window.document.querySelectorAll('[src]')]
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
