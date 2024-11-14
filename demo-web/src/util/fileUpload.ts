import type { UploadFileInfo } from 'naive-ui';
import { ref } from 'vue';

export function useFile() {
  const file = ref<File>();
  function handleNewFileList(files: UploadFileInfo[]) {
    if (files.length > 0) {
      const [newFile] = files;
      if (!newFile.file) {
        return console.error('no interal file object presents in FileUploadInfo');
      }
      file.value = newFile.file;
    }
  }
  function readFile() {
    return new Promise<string>((resolve, reject) => {
      if (!file.value) {
        reject(new Error('No file uploaded'));
        return;
      }
      const reader = new FileReader();
      reader.addEventListener('load', async () => {
        const svg = reader.result as string;
        resolve(svg);
      });
      reader.readAsText(file.value);
    });
  }
  return { file, handleNewFileList, readFile };
}
