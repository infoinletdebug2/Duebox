const { asc } = require('C:/Users/infoi/.appstoreconnect/asc.js');
const fs = require('fs');
(async () => {
  const loc = (await asc('GET', '/v1/appStoreVersions/4494af06-5771-4dec-bc04-1106743a20fb/appStoreVersionLocalizations')).data[0];
  for (const set of (await asc('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`)).data) {
    const shots = (await asc('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots`)).data;
    let i = 0;
    for (const s of shots) {
      const a = s.attributes.imageAsset;
      const url = a.templateUrl.replace('{w}', a.width).replace('{h}', a.height).replace('{f}', 'png');
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      const name = `backup-asc/${set.attributes.screenshotDisplayType}-${++i}-${s.attributes.fileName}`;
      fs.writeFileSync(name, buf);
      console.log(name, buf.length);
    }
  }
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
