<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  interface Props {
    src: string;
    poster?: string;
    autoplay?: boolean;
    onTimeUpdate?: (time: number) => void;
    onEnded?: () => void;
    onError?: (error: string) => void;
  }

  let { src, poster, autoplay = false, onTimeUpdate, onEnded, onError }: Props = $props();

  let videoEl: HTMLVideoElement;
  let hlsInstance: any = null;
  let HlsClass: any = null;
  let loading = $state(true);

  onMount(async () => {
    await initPlayer();
  });

  onDestroy(() => {
    destroyPlayer();
  });

  async function initPlayer() {
    try {
      loading = true;
      
      // 动态加载Hls.js - 关键：只在需要时才加载
      const HlsModule = await import('hls.js');
      HlsClass = HlsModule.default;
      
      if (HlsClass.isSupported()) {
        // HLS原生支持
        hlsInstance = new HlsClass({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          maxBufferSize: 50 * 1000 * 1000,
          maxBufferHole: 0.5,
          startLevel: -1,
        });

        hlsInstance.loadSource(src);
        hlsInstance.attachMedia(videoEl);

        hlsInstance.on(HlsClass.Events.MANIFEST_PARSED, () => {
          loading = false;
          if (autoplay) {
            videoEl.play().catch(() => {});
          }
        });

        hlsInstance.on(HlsClass.Events.ERROR, (event: any, data: any) => {
          if (data.fatal) {
            switch (data.type) {
              case HlsClass.ErrorTypes.NETWORK_ERROR:
                hlsInstance.startLoad();
                break;
              case HlsClass.ErrorTypes.MEDIA_ERROR:
                hlsInstance.recoverMediaError();
                break;
              default:
                destroyPlayer();
                onError?.('播放失败');
                break;
            }
          }
        });
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari原生HLS
        videoEl.src = src;
        loading = false;
        if (autoplay) {
          videoEl.play().catch(() => {});
        }
      } else {
        onError?.('您的浏览器不支持播放此视频');
        loading = false;
      }
    } catch (err) {
      console.error('播放器初始化失败:', err);
      onError?.('播放器初始化失败');
      loading = false;
    }
  }

  function destroyPlayer() {
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }
    HlsClass = null;
  }
</script>

<div class="relative w-full bg-black aspect-video">
  <video
    bind:this={videoEl}
    {poster}
    controls
    playsinline
    preload="metadata"
    class="w-full h-full"
    ontimeupdate={() => onTimeUpdate?.(videoEl.currentTime)}
    onended={() => onEnded?.()}
    onerror={(e) => onError?.('视频加载失败')}
  >
    <track kind="captions" />
  </video>
  
  {#if loading}
    <div class="absolute inset-0 flex items-center justify-center bg-black/50">
      <div class="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
    </div>
  {/if}
</div>

<style>
  video::-webkit-media-controls {
    display: flex !important;
  }
</style>
