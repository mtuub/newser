const axios = require("axios");
const qs = require("qs");
const fs = require("fs/promises");
require("dotenv").config();

async function getFacebookPagePosts(page_id, no_of_posts) {
  let cursor = null;
  const posts = [];

  let data = qs.stringify({
    variables: `{\n    "UFI2CommentsProvider_commentsKey": "CometSinglePageContentContainerFeedQuery",\n    "id": "${page_id}"\n}`,
    doc_id: "5222675981168193",
  });

  const headers = {
    "content-type": "application/x-www-form-urlencoded",
    origin: "https://www.facebook.com",
    referer: "https://www.facebook.com",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
    "sec-ch-prefers-color-scheme": "light",
    "sec-ch-ua":
      '"Chromium";v="110", "Not A(Brand";v="24", "Google Chrome";v="110"',
    "sec-ch-ua-mobile": "?0",
    // "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "x-asbd-id": "198387",
    "x-fb-friendly-name": "CometModernPageFeedPaginationQuery",
    "x-fb-lsd": "AVpqGhKtHww",
  };

  for (let idx = 0; idx < no_of_posts; idx++) {
    if (cursor) {
      data = qs.stringify({
        variables: `{\n    "UFI2CommentsProvider_commentsKey": "CometSinglePageContentContainerFeedQuery",\n    "id": "${page_id}",\n"cursor":"${cursor}"\n}`,
        doc_id: "5222675981168193",
      });
    }

    const response = await axios.post(
      "https://www.facebook.com/api/graphql/",
      data,
      { headers }
    );
    e = {
      variables: `{\n    "UFI2CommentsProvider_commentsKey": "CometSinglePageContentContainerFeedQuery",\n    "id": "${page_id}",\n"cursor":"${cursor}"\n}`,
      doc_id: "5222675981168193",
    };
    try {
      // valid image posts
      cursor = response.data.data.node.timeline_feed_units.page_info.end_cursor;
    } catch (error) {
      // video posts (invalid)
      const regex = /"end_cursor":"([^"]+)"/g;
      try {
        cursor = `${response.data}`
          .match(regex)[0]
          .split(":")[1]
          .replace(/\"/g, "");
        continue;
      } catch (error) {
        return posts.sort((a, b) => b.reaction_count - a.reaction_count);
      }
    }

    try {
      // not all posts have external url and image url
      const post = {
        post_title:
          response.data.data.node.timeline_feed_units.edges[0].node
            .comet_sections.content.story.attachments[0].styles.attachment
            .title_with_entities.text,
        post_url:
          response.data.data.node.timeline_feed_units.edges[0].node
            .comet_sections.content.story.comet_sections.context_layout.story
            .comet_sections.metadata[0].story.url,
        post_text:
          response.data.data.node.timeline_feed_units.edges[0].node
            .comet_sections.content.story.message.text,

        timestamp:
          response.data.data.node.timeline_feed_units.edges[0].node
            .comet_sections.content.story.comet_sections.context_layout.story
            .comet_sections.metadata[0].story.creation_time,
        comment_count:
          response.data.data.node.timeline_feed_units.edges[0].node
            .comet_sections.feedback.story.feedback_context
            .feedback_target_with_context.ufi_renderer.feedback
            .comet_ufi_summary_and_actions_renderer.feedback
            .total_comment_count,
        reaction_count:
          response.data.data.node.timeline_feed_units.edges[0].node
            .comet_sections.feedback.story.feedback_context
            .feedback_target_with_context.ufi_renderer.feedback
            .comet_ufi_summary_and_actions_renderer.feedback.reaction_count
            .count,

        share_count:
          response.data.data.node.timeline_feed_units.edges[0].node
            .comet_sections.feedback.story.feedback_context
            .feedback_target_with_context.ufi_renderer.feedback
            .comet_ufi_summary_and_actions_renderer.feedback.share_count.count,
        external_url:
          response.data.data.node.timeline_feed_units.edges[0].node
            .comet_sections.content.story.attachments[0].comet_footer_renderer
            .attachment.target.external_url,
        image_url:
          response.data.data.node.timeline_feed_units.edges[0].node
            .comet_sections.content.story.attachments[0].styles.attachment.media
            .large_share_image.uri,
      };

      posts.push(post);
    } catch (error) {}
  }

  return posts.sort((a, b) => b.reaction_count - a.reaction_count);
}

async function postToDiscord(post) {
  const webhookURL = process.env.DISCORD_WEBHOOK_URL;

  const date = new Date(post.timestamp * 1000);
  const formattedDate = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const message = {
    embeds: [
      {
        title: post.post_title,
        description: post.post_text,
        thumbnail: {
          url: post.image_url,
        },
        url: post.external_url,
        author: {
          name: `🗓️ ${formattedDate}     😃 ${post.reaction_count}     💬 ${post.comment_count}`,
        },
      },
    ],
  };

  await axios.post(webhookURL, message);
}

(async () => {
  const posts = await getFacebookPagePosts(108299339233098, 10);

  const existingPosts = JSON.parse(await fs.readFile("posts.json", "utf-8"));
  const newPosts = posts.filter(
    (p) =>
      !existingPosts.some((e) => e.external_url === p.external_url) &&
      p.reaction_count > 100
  );

  if (newPosts.length > 0) {
    await fs.writeFile(
      "posts.json",
      JSON.stringify([...existingPosts, ...newPosts])
    );
    console.log(`Scraped: ${posts.length}, New: ${newPosts.length}`);

    for (let idx = 0; idx < newPosts.length; idx++) {
      await postToDiscord(newPosts[idx]);
    }
  }
})();
