// Replace Due Meld's App Store screenshots with out/*.jpg, in the order given.
//   node upload.js iphone 1.jpg 2.jpg ...   (APP_IPHONE_67, 1290x2796)
//   node upload.js ipad 1.jpg 2.jpg ...     (APP_IPAD_PRO_3GEN_129, 2048x2732)
const { asc } = require('C:/Users/infoi/.appstoreconnect/asc.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = '4494af06-5771-4dec-bc04-1106743a20fb'; // Due Meld 1.0
const TYPES = { iphone: 'APP_IPHONE_67', ipad: 'APP_IPAD_PRO_3GEN_129' };
const [device, ...files] = process.argv.slice(2);
const type = TYPES[device];
if (!type || !files.length) throw new Error('usage: node upload.js iphone|ipad <files in order>');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const loc = (await asc('GET', `/v1/appStoreVersions/${VERSION}/appStoreVersionLocalizations`)).data.find((l) => l.attributes.locale === 'en-US');
  const sets = (await asc('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`)).data;
  let set = sets.find((s) => s.attributes.screenshotDisplayType === type);
  if (!set) {
    set = (await asc('POST', '/v1/appScreenshotSets', {
      data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: type }, relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } } },
    })).data;
    console.log('created set', type);
  }
  const old = (await asc('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots`)).data;
  for (const shot of old) await asc('DELETE', `/v1/appScreenshots/${shot.id}`);
  console.log(`removed ${old.length} old ${type} screenshots`);

  const ids = [];
  for (const file of files) {
    const p = path.resolve(__dirname, 'out', file);
    const bytes = fs.readFileSync(p);
    const shot = (await asc('POST', '/v1/appScreenshots', {
      data: { type: 'appScreenshots', attributes: { fileName: file, fileSize: bytes.length }, relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } } },
    })).data;
    for (const op of shot.attributes.uploadOperations) {
      const headers = Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value]));
      const res = await fetch(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
      if (!res.ok) throw new Error(`upload ${file}: ${res.status}`);
    }
    await asc('PATCH', `/v1/appScreenshots/${shot.id}`, {
      data: { type: 'appScreenshots', id: shot.id, attributes: { uploaded: true, sourceFileChecksum: crypto.createHash('md5').update(bytes).digest('hex') } },
    });
    ids.push(shot.id);
    console.log('uploaded', file);
  }
  await asc('PATCH', `/v1/appScreenshotSets/${set.id}/relationships/appScreenshots`, { data: ids.map((id) => ({ type: 'appScreenshots', id })) });

  // Apple processes each file; report its verdict.
  for (let i = 0; i < 20; i++) {
    const now = (await asc('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots`)).data;
    const states = now.map((s) => `${s.attributes.fileName}:${s.attributes.assetDeliveryState?.state}`);
    if (now.every((s) => ['COMPLETE', 'FAILED'].includes(s.attributes.assetDeliveryState?.state))) {
      console.log('final:', states.join('  '));
      const failed = now.filter((s) => s.attributes.assetDeliveryState.state === 'FAILED');
      for (const f of failed) console.log('FAILED', f.attributes.fileName, JSON.stringify(f.attributes.assetDeliveryState.errors));
      return;
    }
    await sleep(3000);
  }
  console.log('still processing — check App Store Connect');
})().catch((e) => {
  console.error(String(e).slice(0, 800));
  process.exit(1);
});
