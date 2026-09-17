export interface ArchiveEntry {
  id: string;
  title: string;
  artist: string;
  year: string;
  image: string | null;
  description: string;
  darkroomRelation: string;
  importance: string;
  keywords: string[];
}

export const archive: ArchiveEntry[] = [
  {
    "id": "A-01",
    "title": "《窗外风景》 / View from the Window at Le Gras",
    "artist": "乔瑟夫·尼舍弗朗·尼埃普斯 / Nicéphore Niépce",
    "year": "1826",
    "image": "图片/经典艺术档案/A-01.jpg",
    "description": "世界现存最早照片：在窗口架设暗箱+沥青版，曝光再显影清洗，得到永久正像。",
    "darkroomRelation": "暗房（暗箱）空间+化学显影双重起源",
    "importance": "高",
    "keywords": [
      "摄影",
      "IMAGE 成像",
      "最早照片",
      "暗箱",
      "沥青版"
    ]
  },
  {
    "id": "A-02",
    "title": "《给予》",
    "artist": "蔡冬冬",
    "year": "2010",
    "image": "图片/经典艺术档案/A-02.jpeg",
    "description": "艺术家1:1完整搭建一间真实暗房，原本完全私密、后台式的工作密室，直接公开给观众观看。",
    "darkroomRelation": "暗房从私密后台空间被公开化展示（HIDDEN 隐藏）",
    "importance": "中",
    "keywords": [
      "装置",
      "HIDDEN 隐藏",
      "暗房还原",
      "私密空间"
    ]
  },
  {
    "id": "A-03",
    "title": "《一条描述圆锥的线》",
    "artist": "安东尼·麦考尔",
    "year": "1973",
    "image": "图片/经典艺术档案/A-03.jpg",
    "description": "16mm投影光束穿过雾气成为可进入、可打断的实体光锥，电影暗房（黑箱+光束）被转化为观众可漫步其中的空间。",
    "darkroomRelation": "电影暗房（黑箱+光束）转化为可步入的空间（ISOLATION 隔绝）",
    "importance": "高",
    "keywords": [
      "影像",
      "ISOLATION 隔绝",
      "实体光",
      "投影",
      "装置影像"
    ]
  },
  {
    "id": "A-04",
    "title": "《暗箱里的房间》系列",
    "artist": "阿贝拉多·莫雷尔",
    "year": "1991起",
    "image": "图片/经典艺术档案/A-04.png",
    "description": "遮黑房间、小孔成像，把世界投影进室内，房间即暗房。",
    "darkroomRelation": "房间本身成为暗房，小孔成像（IMAGE 成像）",
    "importance": "高",
    "keywords": [
      "摄影",
      "IMAGE 成像",
      "小孔成像",
      "房间暗箱"
    ]
  },
  {
    "id": "A-05",
    "title": "《暗房亭》",
    "artist": "杨沛铿",
    "year": "2016",
    "image": "图片/经典艺术档案/A-05.jpg",
    "description": "以红灯水汽重构昏暗空间，打破暗房全黑规则，隐喻内心隐秘与潜意识的边界消解。",
    "darkroomRelation": "以红灯重构暗房空间，打破全黑规则（HIDDEN 隐藏）",
    "importance": "中",
    "keywords": [
      "装置",
      "HIDDEN 隐藏",
      "红灯",
      "潜意识"
    ]
  },
  {
    "id": "A-06",
    "title": "《一小时快相》",
    "artist": "马克·罗曼尼克",
    "year": "2002",
    "image": "图片/经典艺术档案/A-06.jpg",
    "description": "冲洗店店员，冲洗台是他的暗房与窥视口。",
    "darkroomRelation": "冲洗店作为当代暗房与窥视空间（HIDDEN 隐藏）",
    "importance": "中",
    "keywords": [
      "影像",
      "HIDDEN 隐藏",
      "冲洗店",
      "窥视"
    ]
  },
  {
    "id": "A-07",
    "title": "《放大》Blow-Up",
    "artist": "米开朗基罗·安东尼奥尼 / Michelangelo Antonioni",
    "year": "1966",
    "image": "图片/经典艺术档案/A-07.webp",
    "description": "影史最著名的暗房场景，影片中摄影师在暗房不断放大照片寻找线索，暗房成为解析影像与接近真相的空间。",
    "darkroomRelation": "暗房成为解析影像、接近真相的空间（PROCESS 加工）",
    "importance": "高",
    "keywords": [
      "影像",
      "PROCESS 加工",
      "放大",
      "真相",
      "安东尼奥尼"
    ]
  },
  {
    "id": "A-08",
    "title": "《光与影的伟大艺术》 / The Great Art of Light and Shadow",
    "artist": "阿塔纳修斯·基歇尔 Athanasius Kircher",
    "year": "1646",
    "image": "图片/经典艺术档案/A-08.jpg",
    "description": "基歇尔在著作中描绘暗箱原理，展示黑暗空间如何接收并投射外部世界，是暗房成像机制的重要思想来源。",
    "darkroomRelation": "暗箱原理的早期系统论述，暗房成像机制的思想来源（IMAGE 成像）",
    "importance": "中",
    "keywords": [
      "绘画",
      "IMAGE 成像",
      "暗箱",
      "基歇尔",
      "光学"
    ]
  },
  {
    "id": "A-09",
    "title": "《为普通读者和年轻人撰写的自然哲学》",
    "artist": "埃德蒙·阿特金森",
    "year": "1875",
    "image": "图片/经典艺术档案/A-09.jpg",
    "description": "19世纪暗箱版画，作为摄影前身，借暗室投射成像，是后世暗房图像生产的源头雏形。",
    "darkroomRelation": "暗室投射成像，暗房图像生产的源头雏形（IMAGE 成像）",
    "importance": "中",
    "keywords": [
      "绘画",
      "IMAGE 成像",
      "暗箱版画",
      "摄影前身"
    ]
  },
  {
    "id": "A-10",
    "title": "《光学投影》",
    "artist": "西蒙·亨利·盖奇",
    "year": "1914",
    "image": "图片/经典艺术档案/A-10.jpg",
    "description": "大型观光式暗箱，整座小屋就是一个巨大暗箱，顶部镜头把室外风景投射进屋内桌面，人在密闭暗室内观看影像，是暗房的历史前身。",
    "darkroomRelation": "整座小屋即巨大暗箱，暗房的历史前身（IMAGE 成像）",
    "importance": "中",
    "keywords": [
      "空间",
      "IMAGE 成像",
      "观光暗箱",
      "投影"
    ]
  },
  {
    "id": "B-01",
    "title": "红光下的地下暗房",
    "artist": "迈克尔·翁达杰《英国病人》",
    "year": "1992年",
    "image": null,
    "description": "战火纷飞中被暂时定格的肉身欲念与破碎记忆。在暗红光线与药水味中，历史与创伤被缓慢洗印。",
    "darkroomRelation": "暗房作为历史与创伤被缓慢洗印的空间（PROCESS 加工）",
    "importance": "高",
    "keywords": [
      "文学",
      "PROCESS 加工",
      "红光",
      "创伤记忆",
      "翁达杰"
    ]
  },
  {
    "id": "B-02",
    "title": "密闭的摄影暗室",
    "artist": "卡罗尔·安·达菲《战地摄影师》",
    "year": "1985年",
    "image": null,
    "description": "苦难的孵化器。战地摄影师在安宁本土的红光暗室中洗印战火惨剧，形成异域痛苦与大众冷漠的强烈对照。",
    "darkroomRelation": "红光暗室中洗印战火惨剧的封闭空间（PROCESS 加工）",
    "importance": "中",
    "keywords": [
      "文学",
      "PROCESS 加工",
      "战地摄影",
      "红光暗室"
    ]
  },
  {
    "id": "B-03",
    "title": "洗印照片的暗房",
    "artist": "胡里奥·科塔萨尔《魔鬼的涎水》",
    "year": "1959年",
    "image": null,
    "description": "现实的裂缝。放大洗印的静态照片在暗房中活性化并吞噬观察者，显影液中揭示出失控的真相。",
    "darkroomRelation": "暗房中照片活性化，显影液揭示失控真相（PROCESS 加工）",
    "importance": "高",
    "keywords": [
      "文学",
      "PROCESS 加工",
      "科塔萨尔",
      "超现实",
      "显影液"
    ]
  },
  {
    "id": "B-04",
    "title": "冲洗底片的冲印室",
    "artist": "严歌苓《陆犯焉识》",
    "year": "2011年",
    "image": null,
    "description": "政治审视下的记忆留存。利用微缩胶片与显影药水，在极端环境与岁月磨蚀下对抗体制对个体的抹除。",
    "darkroomRelation": "冲印室作为对抗抹除的记忆留存空间（STORAGE 保存）",
    "importance": "中",
    "keywords": [
      "文学",
      "STORAGE 保存",
      "微缩胶片",
      "记忆",
      "严歌苓"
    ]
  },
  {
    "id": "B-05",
    "title": "记忆的暗房",
    "artist": "弗拉基米尔·纳博科夫《透明》",
    "year": "1972年",
    "image": null,
    "description": "意识的显影罐。过去的光影在当下意识的冷水中缓缓浸泡，浮现出带有危险轮廓的记忆潜影。",
    "darkroomRelation": "记忆如显影罐中的潜影缓缓浮现（PROCESS 加工）",
    "importance": "中",
    "keywords": [
      "文学",
      "PROCESS 加工",
      "纳博科夫",
      "记忆潜影"
    ]
  },
  {
    "id": "B-06",
    "title": "阁楼改装的摄相暗房",
    "artist": "托马斯·曼《魔山》",
    "year": "1924年",
    "image": null,
    "description": "透视与病理学。在疗养院暗室中冲洗和观照肉体X光片，通过视觉机器窥见现代文明的衰亡与病态。",
    "darkroomRelation": "疗养院暗室中冲洗X光片，窥见文明病态（IMAGE 成像）",
    "importance": "中",
    "keywords": [
      "文学",
      "IMAGE 成像",
      "X光片",
      "托马斯·曼",
      "病理"
    ]
  },
  {
    "id": "B-07",
    "title": "暗箱与黑室",
    "artist": "萨尔曼·鲁什迪《午夜之子》",
    "year": "1981年",
    "image": null,
    "description": "历史的幻灯机。封闭黑室中的针孔倒映出印度南亚半岛复杂荒诞的历史过程，成为国家寓言的呈现载体。",
    "darkroomRelation": "封闭黑室中的针孔投影成为国家寓言载体（IMAGE 成像）",
    "importance": "中",
    "keywords": [
      "文学",
      "IMAGE 成像",
      "暗箱",
      "鲁什迪",
      "历史寓言"
    ]
  },
  {
    "id": "B-08",
    "title": "封闭的独身卧室/暗房",
    "artist": "亨利·詹姆斯《螺丝在拧紧》",
    "year": "1898年",
    "image": null,
    "description": "压抑的心理暗房。不透光的封闭宅邸空间中，无处曝光的压抑欲望与焦虑投射幻化为恐怖的幽灵镜像。",
    "darkroomRelation": "不透光封闭空间作为心理暗房，投射幽灵镜像（PROCESS 加工）",
    "importance": "中",
    "keywords": [
      "文学",
      "PROCESS 加工",
      "哥特",
      "心理压抑",
      "亨利·詹姆斯"
    ]
  },
  {
    "id": "B-09",
    "title": "照相馆后间暗房",
    "artist": "金宇澄《繁花》",
    "year": "2012年",
    "image": null,
    "description": "市井浮生的定影液。沪上旧照相馆红光与药水味掩盖的私密空间，悄然保存着市井男女的私情与时代余温。",
    "darkroomRelation": "照相馆后间暗房保存市井私情与时代记忆（STORAGE 保存）",
    "importance": "中",
    "keywords": [
      "文学",
      "STORAGE 保存",
      "上海",
      "繁花",
      "照相馆"
    ]
  },
  {
    "id": "B-10",
    "title": "废弃造纸厂暗室",
    "artist": "唐诺《尽头》",
    "year": "2013年",
    "image": null,
    "description": "时间的废墟。废弃空间中无人问津的旧底片在黑暗里自然氧化褪色，象征着文学文本与文明记忆的消解。",
    "darkroomRelation": "废弃暗室中旧底片氧化褪色，象征记忆消解（STORAGE 保存）",
    "importance": "中",
    "keywords": [
      "文学",
      "STORAGE 保存",
      "废墟",
      "底片",
      "记忆消解"
    ]
  },
  {
    "id": "C-01",
    "title": "算法黑盒",
    "artist": "社交平台推荐机制",
    "year": "2020s",
    "image": null,
    "description": "互联网看不见的“暗房”：用户被动接受显影后的信息，却无法得知背后的显影规则。",
    "darkroomRelation": "推荐算法如同看不见的暗房，显影规则不可知（PROCESS 加工）",
    "importance": "高",
    "keywords": [
      "网络",
      "PROCESS 加工",
      "算法",
      "信息茧房",
      "黑盒"
    ]
  },
  {
    "id": "C-02",
    "title": "“小号”与朋友圈分组",
    "artist": "微信 / 微博",
    "year": "2018",
    "image": null,
    "description": "现代人的数字暗房：将真实情绪隐匿于暗处，仅对极少数特定群体“显影”。",
    "darkroomRelation": "数字分身空间，真实情绪仅对特定群体显影（HIDDEN 隐藏）",
    "importance": "中",
    "keywords": [
      "网络",
      "HIDDEN 隐藏",
      "社交媒体",
      "数字暗房"
    ]
  },
  {
    "id": "C-03",
    "title": "暗网与匿名单板",
    "artist": "Tor / 暗网论坛",
    "year": "2015",
    "image": null,
    "description": "赛博空间的无光之地：完全摒弃合法光照，孕育非法交易与极客反叛。",
    "darkroomRelation": "赛博空间的无光之地（HIDDEN 隐藏）",
    "importance": "中",
    "keywords": [
      "网络",
      "HIDDEN 隐藏",
      "暗网",
      "匿名"
    ]
  },
  {
    "id": "C-04",
    "title": "独立暗房体验馆",
    "artist": "小红书 / 青年文化",
    "year": "2023",
    "image": null,
    "description": "将消失的生产工序转化为都市年轻人的情绪疗愈与仪式感消费。",
    "darkroomRelation": "暗房工序成为情绪疗愈与仪式感消费空间（PROCESS 加工）",
    "importance": "中",
    "keywords": [
      "社会现象",
      "PROCESS 加工",
      "体验馆",
      "青年文化",
      "仪式感"
    ]
  },
  {
    "id": "C-05",
    "title": "胶卷挂饰与潮玩",
    "artist": "盲盒/小红书手作",
    "year": "2023",
    "image": null,
    "description": "暗房景观化：将传统暗房中的部件变为掌心潮玩，把原本隐秘的生产性空间转化为显性的赛博审美符号。",
    "darkroomRelation": "暗房部件景观化为显性审美符号（HIDDEN 隐藏）",
    "importance": "低",
    "keywords": [
      "社会现象",
      "HIDDEN 隐藏",
      "潮玩",
      "胶卷",
      "景观化"
    ]
  },
  {
    "id": "C-06",
    "title": "老式拍立得“相纸避光盒”",
    "artist": "胶片器材 / 保养指南",
    "year": "1980s至今",
    "image": null,
    "description": "随身携带的微型暗房：相纸在未吐出前被严密封存于带有防光帘的黑色卡匣中，保证未曝光感光乳剂的“暗房级安全性”。",
    "darkroomRelation": "拍立得相纸卡匣即随身携带的微型暗房（STORAGE 保存）",
    "importance": "中",
    "keywords": [
      "科技",
      "STORAGE 保存",
      "拍立得",
      "避光",
      "微型暗房"
    ]
  },
  {
    "id": "C-07",
    "title": "“不许拍照”的地下酒吧",
    "artist": "都市夜生活 / 社交媒体",
    "year": "2018",
    "image": null,
    "description": "生活方式暗房：进门需暗号、内部禁开闪光灯的暗光酒吧，犹如都市里的“社会暗房”，通过遮光与限流过滤外界喧嚣。",
    "darkroomRelation": "暗光酒吧作为都市社会暗房（HIDDEN 隐藏；ISOLATION 隔绝）",
    "importance": "中",
    "keywords": [
      "社会现象",
      "HIDDEN 隐藏",
      "ISOLATION 隔绝",
      "地下酒吧",
      "都市夜生活"
    ]
  },
  {
    "id": "C-08",
    "title": "主播“禁言/封禁”拉黑",
    "artist": "直播间后台",
    "year": "2021",
    "image": null,
    "description": "直播盛宴下的数字禁闭室：异见者被放逐至无法发声的暗房。",
    "darkroomRelation": "禁言即数字禁闭室，放逐至无法发声的暗房（ISOLATION 隔绝）",
    "importance": "中",
    "keywords": [
      "网络",
      "ISOLATION 隔绝",
      "直播",
      "禁言",
      "数字权力"
    ]
  },
  {
    "id": "C-09",
    "title": "防伪钞票“隐形荧光油墨”",
    "artist": "货币防伪 / 验钞灯",
    "year": "1990s至今",
    "image": null,
    "description": "日常金融的暗房验证：日常日光下完全透明不可见的油墨潜影，唯有放入紫外验钞暗盒中，才能显现出亮丽的防伪图案。",
    "darkroomRelation": "紫外验钞暗盒使隐形油墨潜影显影（IMAGE 成像）",
    "importance": "中",
    "keywords": [
      "科技",
      "IMAGE 成像",
      "荧光油墨",
      "验钞",
      "潜影"
    ]
  },
  {
    "id": "C-10",
    "title": "拍立得相纸“甩动与遮光”现象",
    "artist": "短视频 / 流行误区",
    "year": "2015",
    "image": null,
    "description": "暗房物理学的民间误读：人们习惯在拍立得吐出相纸后疯狂甩动或塞入腋下遮光，这种对“快速显影”的焦虑正是对传统暗房防光机制的日常模仿。",
    "darkroomRelation": "甩动遮光是对传统暗房防光机制的民间模仿（PROCESS 加工）",
    "importance": "低",
    "keywords": [
      "社会现象",
      "PROCESS 加工",
      "拍立得",
      "民间误读",
      "显影焦虑"
    ]
  },
  {
    "id": "D-37",
    "title": "全景监狱塔",
    "artist": "郑淑丽（Shu Lea Cheang）《3x3x6》",
    "year": "2019",
    "image": "图片/形式灵感/D-37.jpg",
    "description": "牢房即旋转暗房的形式转译，六台摄像头把旧监狱改造成一座倒置的全景塔：人脸被实时变形、投影于穹顶——古典的“环形监狱”在此被彻底数码显影。",
    "darkroomRelation": "环形监狱作为倒置暗房的形式转译（IMAGE 成像；HIDDEN 隐藏）",
    "importance": "高",
    "keywords": [
      "装置",
      "IMAGE 成像",
      "HIDDEN 隐藏",
      "全景监狱",
      "监控"
    ]
  },
  {
    "id": "D-38",
    "title": "红光房间",
    "artist": "传统暗房安全灯（safelight）工艺",
    "year": "1851年至今",
    "image": "图片/形式灵感/D-38.jpg",
    "description": "安全灯即准入边界，只有红光被允许通过：安全灯把可见光谱一刀切掉，色彩在暗房里被暂时剥夺——权力就藏在那只灯泡的波长里。",
    "darkroomRelation": "安全灯红光作为暗房准入边界（HIDDEN 隐藏）",
    "importance": "中",
    "keywords": [
      "科技",
      "HIDDEN 隐藏",
      "安全灯",
      "红光",
      "工艺"
    ]
  },
  {
    "id": "D-39",
    "title": "化学痕迹",
    "artist": "Wolfgang Tillmans《Lighter 46》",
    "year": "2008",
    "image": "图片/形式灵感/D-39.jpg",
    "description": "显影、停显、定影——药液在相纸上不可控地流淌，留下本不属于构图的纹路：化学在此成为与摄影师共同署名的作者。",
    "darkroomRelation": "药液痕迹成为显影过程的共同作者（PROCESS 加工）",
    "importance": "中",
    "keywords": [
      "摄影",
      "PROCESS 加工",
      "Tillmans",
      "化学痕迹",
      "显影"
    ]
  },
  {
    "id": "D-40",
    "title": "遮蔽与刮擦",
    "artist": "Tahereh Fallahzadeh 通过刮擦、叠加工艺制作的作品",
    "year": "2010年代",
    "image": "图片/形式灵感/D-40.jpeg",
    "description": "遮挡曝光即记忆修改的形式转译：在放大机上用手、卡片、遮挡物控制局部曝光，再刮去银盐——每一张“完美”照片都是反复遮掩与刮擦的结果，正如记忆。",
    "darkroomRelation": "遮挡与刮擦作为记忆修改的形式转译（PROCESS 加工）",
    "importance": "中",
    "keywords": [
      "摄影",
      "PROCESS 加工",
      "遮挡",
      "刮擦",
      "记忆"
    ]
  },
  {
    "id": "D-42",
    "title": "暗袋",
    "artist": "Changing bag / 显影袋（便携暗房）工艺",
    "year": "1850年代至今",
    "image": "图片/形式灵感/D-42.webp",
    "description": "黑袋即可携带的暗房，在野外没有暗房时，双臂伸入黑袋、在袖口里换装胶片：整间暗房被压缩成一个不透光口袋——所谓安全，只是够一只手活动的黑暗。",
    "darkroomRelation": "整间暗房被压缩成不透光口袋（HIDDEN 隐藏）",
    "importance": "中",
    "keywords": [
      "科技",
      "HIDDEN 隐藏",
      "暗袋",
      "便携暗房",
      "工艺"
    ]
  },
  {
    "id": "D-43",
    "title": "墓穴窖藏",
    "artist": "底片窖藏 / 地下影像档案（nitrate vault）传统",
    "year": "1940–1950年代",
    "image": "图片/形式灵感/D-43.webp",
    "description": "墓穴即永不显影的暗房的形式转译：底片被埋入地下、在恒定低温与黑暗中保存，仿佛墓穴是一座永远不开灯的暗房——记忆在此拒绝被显影，只被窖藏，有些影像注定见不到光。",
    "darkroomRelation": "地下底片窖藏作为永不显影的暗房（STORAGE 保存）",
    "importance": "中",
    "keywords": [
      "空间",
      "STORAGE 保存",
      "底片窖藏",
      "档案",
      "记忆"
    ]
  },
  {
    "id": "D-44",
    "title": "医学负片",
    "artist": "医用卤化银感光胶片，和摄影负片原理同源",
    "year": "1895伦琴发现X射线至今",
    "image": "图片/形式灵感/D-44.jpg",
    "description": "暗房的核心是把一张“看不见的潜影”变成“看得见的照片”，X光把肉身变成一张可投影的负片，再经放大机重新曝光成银盐照片：身体既是拍照的人，也是被拍、显影的对象。",
    "darkroomRelation": "X光负片经暗房放大显影，身体成为显影对象（IMAGE 成像）",
    "importance": "中",
    "keywords": [
      "科技",
      "IMAGE 成像",
      "X光",
      "负片",
      "医学影像"
    ]
  },
  {
    "id": "D-45",
    "title": "孵房",
    "artist": "David Tomas《The Incubator》",
    "year": "1998",
    "image": "图片/形式灵感/D-45.webp",
    "description": "暗房恒温显影、孵卵器类比：显影液必须维持在精确的恒温，就像孵卵器守护一枚蛋——暗房与孵房共享同一种对温度近乎偏执的看护，影像在此被“孵化”而非制作。",
    "darkroomRelation": "暗房与孵房共享恒温看护逻辑，影像被孵化（PROCESS 加工）",
    "importance": "中",
    "keywords": [
      "装置",
      "PROCESS 加工",
      "恒温",
      "孵化",
      "显影液"
    ]
  },
  {
    "id": "D-46",
    "title": "盲文负像",
    "artist": "盲文 / 触觉摄影（触觉图像）实验传统",
    "year": "20世纪起",
    "image": "图片/形式灵感/D-46.jpg",
    "description": "把感光乳剂涂在凸点上，显影后纹理被指尖“看见”：影像不必经过眼睛，暗房把观看彻底转译为触觉——给盲人读的，是一张立起来的底片。",
    "darkroomRelation": "暗房把观看转译为触觉，指尖读取立起的底片（IMAGE 成像）",
    "importance": "中",
    "keywords": [
      "摄影",
      "IMAGE 成像",
      "盲文",
      "触觉摄影",
      "负像"
    ]
  },
  {
    "id": "D-01",
    "title": "算法社会",
    "artist": "Kate Crawford & Trevor Paglen，《Training Humans》",
    "year": "2019–2020",
    "image": null,
    "description": "信息暗房：只让你看到特定“显影”结果的封闭系统。",
    "darkroomRelation": "只呈现特定显影结果的封闭信息系统（ISOLATION 隔绝）",
    "importance": "高",
    "keywords": [
      "摄影",
      "ISOLATION 隔绝",
      "算法",
      "信息暗房",
      "AI训练"
    ]
  }
];
