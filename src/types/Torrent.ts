import { QBittorrentTorrentState } from "../qBittorrent/types/QBittorrentTorrentsMethods";

export interface ITorrent {
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
    // content_path: string;
    seen_complete: number;
    seq_dl: boolean;
    size: number;
    state: QBittorrentTorrentState;
    tags: string;
    tracker: string;
    upspeed: number;
    piece_states?: string;
    queryIds?: number[];
    queryGroupIds?: (number | null)[]
}