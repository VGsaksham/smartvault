const folderPaths = [];
const fileEntries = [];

async function traverseFileTree(item, path = '') {
  if (!item) return;
  if (item.isFile) {
    fileEntries.push({ file: item.name, relPath: path + item.name });
  } else if (item.isDirectory) {
    const dirPath = path + item.name;
    folderPaths.push(dirPath);
    for (const entry of item.entries) {
      await traverseFileTree(entry, path + item.name + '/');
    }
  }
}

const root = {
  isDirectory: true,
  isFile: false,
  name: 'Parent',
  entries: [
    { isDirectory: true, isFile: false, name: 'EmptySub', entries: [] },
    { isDirectory: true, isFile: false, name: 'FilledSub', entries: [ { isFile: true, isDirectory: false, name: 'file.txt' } ] }
  ]
};

traverseFileTree(root).then(() => {
  console.log('folderPaths:', folderPaths);
  console.log('fileEntries:', fileEntries);
});
