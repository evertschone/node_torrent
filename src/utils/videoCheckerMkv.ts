/// <reference path="../types/typing.d.ts" />

import * as fs from 'fs';
import * as mkv from 'matroska';

interface EbmlElement {
    _name: string;
    start: number;
    end: number;
    getPosition: () => number
    children: EbmlElement[];
    getUInt(): number;
}

interface KeyframeInfo {
    timestamp: number;
    byteOffset: number;
    frameNumber?: number;
    available?: boolean;
    size?: number
}

function onlySeekCuesAndTracks() {
    return {
        skipTags: {
            SimpleBlock: true,
            Void: true,
            Block: true,
            FileData: true,
            Cluster: true
        }
    };
}

function atPath(data: EbmlElement | undefined, ...args: string[]): EbmlElement | undefined {
    let currentData = data;
    for (const arg of args) {
        if (!arg || !currentData || !currentData.children) return;
        currentData = currentData.children.find(x => x._name === arg);
        if (!currentData) return;
    }
    return currentData;
}

function findById(all: EbmlElement[], name: string): EbmlElement | undefined {
    return all.find(x => x._name === name);
}

function getForMkv(url: string, cb: (err: Error | null, frames?: KeyframeInfo[]) => void) {
    const decoder = new mkv.Decoder(onlySeekCuesAndTracks());
    fs.readFile(url, (err, data) => {
        if (err) return cb(err);

        decoder.parseEbmlIDs(url, [mkv.Schema.byName.Segment, mkv.Schema.byName.Cues, mkv.Schema.byName.Tracks, mkv.Schema.byName.Info], (err, doc: { children: EbmlElement[] }) => {
            if (err) return cb(err);

            // Find the segment start position
            const segment = findById(doc.children, "Segment");
            if (!segment) return cb(new Error("Segment not found"));

            const segmentStart = segment.start

            // Get the timecode scale from the Info element
            const info = atPath(segment, "Info");
            const timecodeScaleElement = info ? findById(info.children, "TimecodeScale") : undefined;
            const timecodeScale = timecodeScaleElement ? timecodeScaleElement.getUInt() : 1000000; // default value is 1ms if not specified
            // let timecodeScale = 100000
            // Select the video track
            let videoTrackIdx = -1; // initial value
            const tracks = atPath(segment, "Tracks");
            if (tracks) {
                tracks.children.forEach(track => {
                    if (!track.children) return;

                    // https://matroska.org/technical/specs/index.html#Tracks
                    const trackNum = findById(track.children, "TrackNumber")?.getUInt(); // TrackNumber
                    const trackType = findById(track.children, "TrackType")?.getUInt(); // TrackType  (1: video, 2: audio, 3: complex, 0x10: logo, 0x11: subtitle, 0x12: buttons, 0x20: control).

                    if (trackType === 1 && trackNum !== undefined) videoTrackIdx = trackNum;
                });
            }

            if (videoTrackIdx === -1) return cb(new Error('No video tracks found'));

            // Go through CuePoint(s) and filter out the ones which are from the video track
            const cues = atPath(segment, "Cues");
            if (!(cues && cues.children && cues.children.length)) return cb(new Error("No cues found in doc -> Segment -> Cues"));

            const cuePoints = cues.children.filter(x => x._name === "CuePoint");

            if (!cuePoints.length) return cb(new Error("No CuePoints"));

            const frames: KeyframeInfo[] = cuePoints.filter(cue => {
                // children[1] is CueTrackPositions; first child of that is CueTrack
                // we need that to determine if this is a part of the video track
                return cue.children[1].children[0].getUInt() === videoTrackIdx;
            }).map(cue => {
                // children[0] is CueTime
                // children[1] is CueTrackPositions
                // children[1].children[1] is CueClusterPosition
                const t = cue.children[0].getUInt();
                const pos = cue.children[1].children[1].getUInt();
                const absPos = pos + segmentStart;
                const adjustedTime = (t * timecodeScale) / 1000000000; // Adjust time using timecode scale

                return { timestamp: adjustedTime, byteOffset: absPos, size: 10000 };
            });

            cb(null, frames);
        });
    });
}

export default getForMkv;