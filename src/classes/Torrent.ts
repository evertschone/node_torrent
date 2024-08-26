import { ITorrent } from '../types/Torrent';
import { QBittorrentTorrentState } from '../qBittorrent/types/QBittorrentTorrentsMethods';

export class Torrent implements ITorrent {
  hash: string;
  name: string;
  category: string;
  added_on: number;
  total_size: number;
  progress: number;
  time_active: number;
  num_seeds: number;
  num_leechs: number;
  resultGuid?: string;
  availability: number;
  completion_on: number;
  dlspeed: number;
  eta: number;
  f_l_piece_prio: boolean;
  force_start: boolean;
  last_activity: number;
  num_complete: number;
  num_incomplete: number;
  priority: number;
  save_path: string;
  seen_complete: number;
  seq_dl: boolean;
  size: number;
  state: QBittorrentTorrentState;
  tags: string;
  tracker: string;
  upspeed: number;
  piece_states: string;

  constructor(torrent: ITorrent) {
    this.hash = torrent.hash;
    this.name = torrent.name;
    this.category = torrent.category;
    this.added_on = torrent.added_on;
    this.total_size = torrent.total_size;
    this.progress = torrent.progress;
    this.time_active = torrent.time_active;
    this.num_seeds = torrent.num_seeds;
    this.num_leechs = torrent.num_leechs;
    this.resultGuid = torrent.resultGuid;
    this.availability = torrent.availability;
    this.completion_on = torrent.completion_on;
    this.dlspeed = torrent.dlspeed;
    this.eta = torrent.eta;
    this.f_l_piece_prio = torrent.f_l_piece_prio;
    this.force_start = torrent.force_start;
    this.last_activity = torrent.last_activity;
    this.num_complete = torrent.num_complete;
    this.num_incomplete = torrent.num_incomplete;
    this.priority = torrent.priority;
    this.save_path = torrent.save_path;
    this.seen_complete = torrent.seen_complete;
    this.seq_dl = torrent.seq_dl;
    this.size = torrent.size;
    this.state = torrent.state;
    this.tags = torrent.tags;
    this.tracker = torrent.tracker;
    this.upspeed = torrent.upspeed;
    this.piece_states = JSON.stringify(torrent.piece_states);
  }
}