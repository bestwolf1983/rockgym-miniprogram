/**
 * 场馆 —— 多店品牌的门面。
 *
 * 回答两个问题：这家店在哪 / 这个品牌还有哪些店。
 * 换线信息在首页（值不值得来），课程与教练也在首页；这里是「去哪家」。
 *
 * ⚠️ 门店清单为什么写在端上而不是读库
 * ---------------------------------------------------------------------------
 * 后端 `rg_store` 目前只有三里屯一家（v1 单店），其余三家没有课表、线路、
 * 教练数据 —— 入库只会得到三张点进去什么都没有的空店，比不展示更糟。
 * 因此本期把「品牌有四家店」作为展示信息放在端上常量里，
 * 门店数据接入（会员卡跨店、跨店课表）时再改为读 `rg_store` 并删掉本常量。
 *
 * 门店照片素材由品牌方提供并授权使用。
 */
import { syncTabBar } from '../../services/tabbar';
import { ASSET_CDN_BASE } from '../../services/config';

type VenueStatus = 'CURRENT' | 'SOON';

interface Venue {
  id: string;
  name: string;
  city: string;
  addr: string;
  img: string;
  status: VenueStatus;
  statusLabel: string;
}

const VENUES: Venue[] = [
  {
    id: 'slt',
    name: 'CAMP4 岩肆（三里屯）',
    city: '北京',
    addr: '北京市朝阳区三里屯街道中海置业白家庄商务中心 A 座二楼',
    img: `${ASSET_CDN_BASE}/assets/venue/store-02.jpg`,
    status: 'CURRENT',
    statusLabel: '已开通',
  },
  {
    id: 'jt',
    name: 'CAMP4 攀岩馆（将台）',
    city: '北京',
    addr: '北京市朝阳区酒仙桥街道毕淘买生活广场 F2-005',
    img: `${ASSET_CDN_BASE}/assets/venue/store-01.jpg`,
    status: 'SOON',
    statusLabel: '即将开通',
  },
  {
    id: 'cs',
    name: 'CAMP4 岩肆（长沙西湖公园）',
    city: '长沙',
    addr: '湖南省长沙市岳麓区西湖公园 Inpark 商场一层 D03-2',
    img: `${ASSET_CDN_BASE}/assets/venue/store-04.jpg`,
    status: 'SOON',
    statusLabel: '即将开通',
  },
  {
    id: 'sh',
    name: 'CAMP4 岩肆（上海 8 号桥）',
    city: '上海',
    addr: '上海市黄浦区局门路 457 号',
    img: `${ASSET_CDN_BASE}/assets/venue/store-03.jpg`,
    status: 'SOON',
    statusLabel: '即将开通',
  },
];

Page({
  data: {
    venues: VENUES,
  },

  onShow() {
    // 序号必须与 app.json 的 tabBar.list 一致：0 首页 / 1 场馆 / 2 购卡 / 3 我的
    syncTabBar(this, 1);
  },

  /**
   * 点门店。
   *
   * 未开通的店不给"更多"的假入口 —— 直说还没开通，避免用户点进去看到空白页。
   * 这在多店品牌里是常态：会员想知道上海店在哪，但此刻只能在北京爬。
   */
  onVenueTap(e: WechatMiniprogram.TouchEvent) {
    const { id, status } = e.currentTarget.dataset as { id: string; status: VenueStatus };
    const venue = this.data.venues.find((v: Venue) => v.id === id);

    if (status === 'CURRENT') {
      wx.showToast({ title: '当前门店 · 三里屯', icon: 'none' });
      return;
    }
    wx.showToast({ title: `${venue?.name ?? '该门店'} 正在接入，敬请期待`, icon: 'none' });
  },
});
