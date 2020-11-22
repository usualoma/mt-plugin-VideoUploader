function init() {
  const $ = window.jQuery;

  const $width = $(`<input name="video_uploader_width" type="hidden" />`);
  const $height = $(`<input name="video_uploader_height"  type="hidden" />`);
  $("#upload").append($width);
  $("#upload").append($height);

  $("#mt-plugin-video-uploader-filename").on(
    "input.MTPluginVideoUploader",
    (ev) => {
      const $span = $("<span />").text(ev.target.value).appendTo("body");
      $(ev.target).css({ width: `${$span.width() + 25}px` });
      $span.remove();
    }
  );

  const { createFFmpeg, fetchFile } = window.FFmpeg;
  const $console = $("#mt-plugin-video-uploader-console");
  let srcWidth, srcHeight;
  const ffmpeg = createFFmpeg({
    log: true,
    logger: ({ message }) => {
      const m = message.match(/Stream.*Video.*, (\d+)x(\d+)/);
      if (m) {
        srcWidth = m[1];
        srcHeight = m[2];
      }

      $console.html(
        $console.html() + $("<div>").text(message).html() + "<br />"
      );
      $console.get(0).scrollTop = $console.get(0).scrollHeight;
    },
  });

  const loadFfmpeg = () => {
    if (ffmpeg.isLoaded()) {
      return Promise.resolve();
    }
    return ffmpeg.load();
  };
  if (window.requestIdleCallback) {
    window.requestIdleCallback(loadFfmpeg);
  }
  const transcode = async ({ target: { files } }) => {
    await loadFfmpeg();

    const { name } = files[0];
    ffmpeg.FS("writeFile", name, await fetchFile(files[0]));
    await ffmpeg.run(
      "-i",
      name,
      "-c:v",
      "libx264",
      "-c:a",
      "libfdk_aac",
      "output.mp4"
    );
    const data = ffmpeg.FS("readFile", "output.mp4");
    return data;
  };

  const uploadFiles = window.uploadFiles;
  window.uploadFiles = async (files, items) => {
    let promise = Promise.resolve();
    for (let i = 0; i < files.length; i++) {
      if (files[i].size === 0) {
        // Maybe directory
        continue;
      }
      if (
        items &&
        items[i].webkitGetAsEntry &&
        items[i].webkitGetAsEntry().isDirectory
      ) {
        // Maybe directory only for Chrome
        continue;
      }

      const f = files[i];

      if (!f.type.match("video.*")) {
        uploadFiles([f]);
        continue;
      }

      promise = promise.then(
        () =>
          new Promise(async (resolve) => {
            const identifier = Math.round(Math.random() * 1000);
            const transcodePromise = transcode({ target: { files: [f] } });
            const name = f.name.replace(/\.[^.]+$/, ".mp4");

            $("#mt-plugin-video-uploader-upload").prop("disabled", true);
            transcodePromise.then(() => {
              $("#mt-plugin-video-uploader-upload").prop("disabled", false);
            });

            $("#mt-plugin-video-uploader-modal").one(
              `shown.bs.modal.MTPluginVideoUploader.${identifier}`,
              () => {
                // shown
              }
            );

            $("#mt-plugin-video-uploader-modal").one(
              `hidden.bs.modal.MTPluginVideoUploader.${identifier}`,
              () => {
                $("#mt-plugin-video-uploader-upload").off(
                  `click.MTPluginVideoUploader.${identifier}`
                );
                $("#mt-plugin-video-uploader-cancel").off(
                  `click.MTPluginVideoUploader.${identifier}`
                );

                resolve();
              }
            );

            $("#mt-plugin-video-uploader-filename")
              .val(name)
              .triggerHandler("input.MTPluginVideoUploader");

            $console.html("");
            $("#mt-plugin-video-uploader-modal").modal({
              backdrop: "static",
              keyboard: false,
            });

            $("#mt-plugin-video-uploader-upload").on(
              `click.MTPluginVideoUploader.${identifier}`,
              async (ev) => {
                $("#mt-plugin-video-uploader-upload").prop("disabled", true);

                const data = await transcodePromise;
                const fileName =
                  $("#mt-plugin-video-uploader-filename").val() || name;

                $("#mt-plugin-video-uploader-modal").modal("hide");

                $width.val(srcWidth);
                $height.val(srcHeight);

                uploadFiles([
                  new File([data.buffer], fileName, { type: "video/mp4" }),
                ]);
              }
            );

            $("#mt-plugin-video-uploader-cancel").on(
              `click.MTPluginVideoUploader.${identifier}`,
              async (ev) => {
                // cancel transcode
              }
            );
          })
      );
    }
  };
}
init();
