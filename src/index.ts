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
  robotId: string
}

export interface Check {
  id: string
  name: string
  time: Date
  fname: string
  fid: string
  guild: string
}

export const Config: Schema<Config> = Schema.object({
  url:Schema.string(),
  token:Schema.string(),
  robotId:Schema.string(),
})

export function apply(ctx: Context, config:Config) {

  ctx.model.extend('check', {
    id: "string",
    name: "string",
    time: "date",
    fname: "string",
    fid: "string",
    guild: "string",
  },{
    unique: ["id", "guild"],
});

  // 注册命令
  ctx.command('sign <qnumber:text>', '注册指令，指定唯一编号', { checkArgCount: true })
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
  ctx.command('bind <fname:text>', '绑定指令，指定论坛用户名', { checkArgCount: true })
    .alias('绑定')
    .action(async ({ session }, fname) => {
      // console.log(config.robotId);
      const getUser = await ctx.http.get(config.url + '/api/users?filter[q]=' + fname,
        {
          headers: {
            Authorization: 'Token ' + config.token + `;userId=`+ config.robotId,
          },
        });
      const userResponse = getResponse(getUser);
      const filterUser = userResponse.data.filter((value, index, arr) => {
        return value.attributes.username == fname
      })
      // 获取第一个元素
      // console.log(userResponse.data.length);
      if(filterUser.length != 0) {
        // console.log(filterUser);
        let fid = filterUser[0].id;
        // 更新数据数据库
        await ctx.database.upsert('check', [{
          id:session.userId,
          guild:session.guildId,
          fname:fname,
          fid:fid,
        }]);
        return `绑定成功！`;
      } else {
        return `不存在用户名：${fname}，请重新绑定！`;
      }

    });

  // 查看命令
  ctx.command('info [qname]:string]', '查看信息')
  .alias('查看')
  .action(async ({ session }, qname) => {
    let info;
    if(qname) {
      info = await ctx.database.get('check', {
        name:qname,
        guild:session.guildId,
      }, ['name', 'fname']);
    } else {
      info = await ctx.database.get('check', {
        id:session.userId,
        guild:session.guildId,
      }, ['name', 'fname']);
    }
    // console.log(info);
    const {name, fname} =  info[0];
    return `群名：${name??'无'} 论坛名：${fname??'无'}`;
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
  .option('tag', '-t [tag:string]', {fallback: 'auto'})
  .alias('发帖')
  .action(async ({ session, options }, title, content) => {
    // 机器人论坛ID
    let fid = config.robotId;
    // 是否使用个人账号
    let flag = false;
    // 获取用户名
    const getID = await ctx.database.get('check', {
      id:session.userId,
      guild:session.guildId,
    }, ['fid']);
    // console.log(getID);
    // 取第一个
    if(!getID[0].fid) {
      fid = getID[0].fid;
    }

    // 获取 tags 数据
    const getTags = await ctx.http.get(config.url + '/api/tags');
    const tagObject = getResponse(getTags);
    const tagMap =  Object.fromEntries(tagObject?.data?.map(tag => [tag.attributes.slug, parseInt(tag.id)]));

    let tagId = tagMap['auto'];
    if(options?.tag in tagMap) {
      tagId = tagMap[options?.tag];
    }

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
        Authorization: 'Token ' + config.token + `;userId=${fid}`,
      },
    }
);
  const postResponse = getResponse(postDiscussions);
  return `发帖成功！`;
  });
}


const getResponse = (arraybuffer) => {
  const bufferString = Buffer.from(arraybuffer).toString('utf8');
  // console.log(bufferString);
  try {
    const jsonObject = JSON.parse(bufferString);
    return jsonObject;
  } catch (error) {
    return error.message;
  }
}
