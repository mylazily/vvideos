export interface Video {
  id?: number;
  vod_id: string;
  title: string;
  cover: string;
  category?: string;
  duration?: number | string;
  views?: number;
  created_at?: number;
  updated_at?: number;
  status?: number;
  play_url?: string;
  vod_year?: string;
  vod_area?: string;
  vod_director?: string;
  vod_actor?: string;
  vod_lang?: string;
  vod_remarks?: string;
}
