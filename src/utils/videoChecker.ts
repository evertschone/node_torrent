/// <reference path="../types/typing.d.ts" />

import { exec } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import fileType from 'file-type';
import MP4Box from 'mp4box';


import getForMkv from './videoCheckerMkv';

interface KeyframeInfo {
  timestamp: number;
  byteOffset: number;
  frameNumber?: number;
  available?: boolean;
  size?: number
}

interface FileInfo {
  type: string;
  size: number;
}

async function detectFileTypeAndSize(filePath: string): Promise<FileInfo> {
  const buffer = Buffer.alloc(4100);
  const fd = await fs.open(filePath, 'r');
  await fs.read(fd, buffer, 0, 4100, 0);
  await fs.close(fd);
  const type = await fileType.fromBuffer(buffer);
  const fileSize = (await fs.stat(filePath)).size
  return {
    type: type?.ext || '',
    size: fileSize,
  };
}

function parseTimestamp(timestamp: string): number {
  const parts = timestamp.split(':');
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseFloat(parts[2]);
  return hours * 3600 + minutes * 60 + seconds;
}

function extractKeyframesMKV(videoPath: string): Promise<KeyframeInfo[]> {
  return new Promise((resolve, reject) => {
    getForMkv(videoPath, (err, frames) => { if (frames) { resolve(frames) } else { reject(err) } })

    // const command = `C:/Projects/project2_node_torrent/src/utils/bin/mkvinfo -s "${videoPath}"`;

    // exec(command, (error, stdout, stderr) => {
    //   if (error) {
    //     reject(`Error: ${error.message}`);
    //     return;
    //   }
    //   if (stderr) {
    //     console.error(`stderr: ${stderr}`);
    //   }

    //   const keyframes: KeyframeInfo[] = [];
    //   const lines = stdout.split('\n');
    //   let frameNumber = 0;

    //   for (const line of lines) {
    //     const timestampMatch = line.match(/Timecode: (\d+:\d+:\d+\.\d+)/);
    //     const byteOffsetMatch = line.match(/Size: (\d+) bytes/);

    //     if (timestampMatch && byteOffsetMatch) {
    //       const timestamp = parseTimestamp(timestampMatch[1]);
    //       const byteOffset = parseInt(byteOffsetMatch[1], 10);

    //       keyframes.push({
    //         frameNumber: frameNumber++,
    //         timestamp: timestamp,
    //         byteOffset: byteOffset,
    //       });
    //     }
    //   }

    //   resolve(keyframes);
    // });
  });
}


async function getKeyframes(url: string, fileSize: number): Promise<KeyframeInfo[]> {
  const fetchRange = async (start: number, end: number): Promise<ArrayBuffer> => {
    const buffer = Buffer.alloc(end - start + 1);
    const fd = await fs.open(url, 'r');
    try {
      await fs.read(fd, buffer, 0, end - start + 1, start);
    } finally {
      await fs.close(fd);
    }
    return buffer.buffer;
  };

  return new Promise(async (resolve, reject) => {
    try {
      // First, fetch the headers to get the content length
      let startRange = 0;
      const expandRange = 480000;
      let contentLength = fileSize - 1;

      let endRange = contentLength;
      let moovFound = false;
      const mp4boxfile = MP4Box.createFile();
      const keyframes: KeyframeInfo[] = [];

      const processBuffer = (arrayBuffer: ArrayBuffer, fileStart: number) => {
        const buffer = arrayBuffer as MP4Box.MP4ArrayBuffer;
        buffer.fileStart = fileStart;
        mp4boxfile.appendBuffer(buffer);
      };

      mp4boxfile.onReady = function (videoData: MP4Box.MP4Info) {
        console.log('onReady');
        let trackId: number | null = null;
        let nb_samples: number | null = null;
        for (let i = 0; i < videoData.tracks.length; i++) {
          if (videoData.tracks[i].type === 'video') {
            trackId = videoData.tracks[i].id;
            nb_samples = videoData.tracks[i].nb_samples;
          }
        }

        if (trackId != null) {
          console.log('track found');

          const track: MP4Box.MP4MediaTrack = mp4boxfile?.moov?.traks?.find((tk: any) => tk.tkhd.track_id == trackId);
          const samples = track.samples

          console.log('got samples');
          //do something
          samples.forEach((sample: MP4Box.MP4Sample) => {
            if (sample.is_sync) {
              keyframes.push({
                timestamp: sample.cts / sample.timescale,
                byteOffset: sample.offset,
                frameNumber: sample.number,
                size: sample.size
              });
            }
          });
          let lastSamp = samples.slice(-1)[0]
          keyframes.push({ timestamp: lastSamp.cts / lastSamp.timescale, frameNumber: lastSamp.number, byteOffset: lastSamp.offset, size: 0 })
          moovFound = true;
          resolve(keyframes);

          //Request the track
        } else {
          console.error('Track not found');
        }
      };

      mp4boxfile.onError = (e: any) => {
        reject(e);
      };

      while (!moovFound) {
        if (startRange < contentLength) {
          const startBuffer = await fetchRange(startRange, startRange + expandRange);
          processBuffer(startBuffer, startRange);
          startRange += expandRange;
          console.log('startRange', startRange)
        }

        if (!moovFound && endRange > 0) {
          const endBuffer = await fetchRange(Math.max(endRange - expandRange, 0), endRange);
          processBuffer(endBuffer, Math.max(endRange - expandRange, 0));
          endRange -= expandRange;
          console.log('endRange', endRange)
        }

        if (startRange >= contentLength && endRange <= 0) {
          break;
        }
      }

      if (!moovFound) {
        reject('moov atom not found');
      }
    } catch (error) {
      reject(error);
    }
  });
}


export async function extractKeyframes(videoPath: string): Promise<KeyframeInfo[]> {
  const fileInfo = await detectFileTypeAndSize(videoPath);
  if (fileInfo.type === 'mp4') {
    //return extractKeyframesMP4(videoPath);
    return getKeyframes(videoPath, fileInfo.size);
  } else if (fileInfo.type === 'mkv') {
    return extractKeyframesMKV(videoPath);
  } else {
    throw new Error(`Unsupported file type: ${fileType}`);
  }
}




// import ffmpeg from 'fluent-ffmpeg';
// import fs from 'fs-extra';
// import path from 'path';

// interface KeyframeInfo {
//   frameNumber: number;
//   timestamp: number;
//   byteOffset: number;
// }

// /**
//  * Extracts keyframe (iframe) information using ffmpeg.
//  * @param {string} videoPath - Path to the video file.
//  * @returns {Promise<KeyframeInfo[]>} - A promise that resolves with an array of keyframe information.
//  */
// export function extractKeyframes(videoPath: string): Promise<KeyframeInfo[]> {
//   return new Promise((resolve, reject) => {
//     const command = ffmpeg(videoPath)
//       .outputOptions('-vf', 'showinfo')
//       .output('null') // Use 'null' to discard the output
//       .format('null') // Specify the null format
//       .on('start', (cmd) => {
//         console.log(`Started ffmpeg with command: ${cmd}`);
//       })
//       .on('stderr', (stderrLine) => {
//         console.log(stderrLine);
//       })
//       .on('end', () => {
//         console.log('ffmpeg processing finished.');
//         resolve(keyframes);
//       })
//       .on('error', (err) => {
//         console.error(`Error: ${err.message}`);
//         reject(err);
//       });

//     let keyframes: KeyframeInfo[] = [];
//     command.on('stderr', (line: string) => {
//       const match = line.match(/n:(\d+).*pts_time:(\d+\.\d+).*pkt_pos:(\d+)/);
//       if (match) {
//         keyframes.push({
//           frameNumber: parseInt(match[1], 10),
//           timestamp: parseFloat(match[2]),
//           byteOffset: parseInt(match[3], 10),
//         });
//       }
//     });

//     command.run();
//   });
// }

// /**
//  * Checks for the presence of keyframes at specified byte offsets.
//  * @param {string} videoPath - Path to the video file.
//  * @param {number[]} byteOffsets - Array of byte offsets to check.
//  * @returns {Promise<{ byteOffset: number; hasIframe: boolean }[]>} - A promise that resolves with an array of results for each byte offset.
//  */
// async function checkByteOffsets(videoPath: string, byteOffsets: number[]): Promise<{ byteOffset: number; hasIframe: boolean }[]> {
//   const keyframes = await extractKeyframes(videoPath);
//   return byteOffsets.map((offset) => ({
//     byteOffset: offset,
//     hasIframe: keyframes.some((kf) => kf.byteOffset === offset),
//   }));
// }

// // Example usage
// // (async () => {
// //   const videoFilePath = path.resolve(__dirname, 'example.mp4');
// //   const offsetsToCheck = [1024, 2048, 4096]; // Example byte offsets

// //   try {
// //     const results = await checkByteOffsets(videoFilePath, offsetsToCheck);
// //     console.log(results);
// //   } catch (error) {
// //     console.error('Error checking byte offsets:', error);
// //   }
// // })();