const fs = require('node:fs/promises');

module.exports = async function addNotificationCapability(manifestPath) {
  let manifest = await fs.readFile(manifestPath, 'utf8');
  if (manifest.includes('Name="userNotificationListener"')) return;

  manifest = manifest.replace(
    'xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"',
    'xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"\n   xmlns:uap3="http://schemas.microsoft.com/appx/manifest/uap/windows10/3"',
  );
  manifest = manifest.replace(
    '<Capabilities>',
    '<Capabilities>\n    <uap3:Capability Name="userNotificationListener" />',
  );
  await fs.writeFile(manifestPath, manifest, 'utf8');
};
