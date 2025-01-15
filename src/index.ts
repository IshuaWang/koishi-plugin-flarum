import { Context, Schema, h } from 'koishi'

declare module "koishi" {
  interface Tables {
      check: Check;
  }
}

export const name = 'flarum'

export const inject = ['database']
export interface Config {
  url: string
  token: string
}

export interface Check {
  id: string
  name: string
  time: Date
  fname: string
  guild: string
}

export const Config: Schema<Config> = Schema.object({
  url:Schema.string(),
  token:Schema.string(),
})

export function apply(ctx: Context, config:Config) {

  ctx.model.extend('check', {
    id: "string",
    name: "string",
    time: "date",
    fname: "string",
    guild: "string",
  },{
    unique: ["id", "guild"],
});

  // 注册命令
  ctx.command('sign <qnumber:text>', '注册指令，指定唯一编号')
    .alias('注册')
    .action(async ({ session }, qnumber) => {
      // 更新数据到数据库
      await ctx.database.upsert('check', [{
        id:session.userId,
        guild:session.guildId,
        name:qnumber,
      }]);
      return `注册成功！`;
    });

  // 绑定命令
  ctx.command('bind <fname:text>', '绑定指令，指定论坛用户名')
    .alias('绑定')
    .action(async ({ session }, fname) => {
      // 更新数据数据库
      await ctx.database.upsert('check', [{
        id:session.userId,
        guild:session.guildId,
        fname:fname,
      }]);
      return `绑定成功！`;
    });

  // 打卡命令
  ctx.command('record <url:text>', '打卡指令，必须添加分享链接')
    .alias('打卡')
    .action(async ({ session }) => {
      // 更新时间到数据库
      await ctx.database.upsert('check', [{
        id:session.userId,
        guild:session.guildId,
        time: new Date(),
      }] );
      return `打卡成功！`;
    });

  // 统计未打卡用户的命令
  ctx.command('stats [day:number]', '统计未打卡的用户')
    .alias('统计')
    .action(async ({ session }, day) => {
      // 设置默认值
      if(day == null) {
        day = 30;
      }
      const daysBofore = new Date();
      daysBofore.setDate(daysBofore.getDate() - day);

      // 查询若干天内未打卡的用户
      const allUsers = await ctx.database.get('check', {guild:session.guildId});
      // console.log(session);
      const inactiveUsers = allUsers.filter(user => !user.time || new Date(user.time) < daysBofore);

      if (inactiveUsers.length === 0) {
        return '所有群员都打卡过，很棒！';
      }

      const result = inactiveUsers
        .map(user => `昵称: ${user.name}，最后打卡时间: ${user.time ? new Date(user.time).toLocaleDateString() : '从未打卡'}`)
        .join('\n');

      return `以下群友在${day}天内未打卡：\n${result}`;
    });

  // 发帖命令
  ctx.command('post <title:string> <content:string>', '向论坛发帖')
  .option('tag', '-t <tag:string>', {fallback: 'auto'})
  .alias('发帖')
  .action(async ({ session, options }, title, content) => {
    // 获取 tags 数据
    const getTags = await ctx.http.get(config.url + '/api/tags');
    const tagObject = getResponse(getTags);
    const tagMap =  Object.fromEntries(tagObject?.data?.map(tag => [tag.attributes.slug, parseInt(tag.id)]));
    console.log(tagMap);
    let tagId = tagMap['auto'];
    if(options?.tag in tagMap) {
      tagId = tagMap[options?.tag];
    }
    console.log(tagId);
    console.log(config.url, config.token);
    const postDiscussions = await ctx.http.post(config.url + '/api/discussions',
      {
        "data":{
          "type": "discussions",
          "attributes": {
            "title": title,
            "content": content
          },
          "relationships": {
            "tags": {
              "data": [
                {
                  "type": "tags",
                  "id": tagId
                }
              ]
            }
          }
        }
      }
      ,
    {
      headers: {
        Authorization: 'Token ' + config.token + `;`,
      },
    }
);
  const postResponse = getResponse(postDiscussions);
  return `发帖成功！`;
  });
}


const getResponse = (arraybuffer) => {
  const bufferString = Buffer.from(arraybuffer).toString('utf8');
  try {
    const jsonObject = JSON.parse(bufferString.toString());
    return jsonObject;
  } catch (error) {
    return error.message;
  }
}
