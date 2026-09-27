export const EQUIPMENT_CATALOG_VERSION = 1;
export const HEAVENLY_MIRROR_ID = "heavenly-mirror";
export const CALCULATION_ARRAY_ID = "calculation-array";
export const SPLIT_MIND_PENDANT_ID = "split-mind-pendant";
export const BASE_ACTIVE_CLAIM_LIMIT = 1;
export const SPLIT_MIND_ACTIVE_CLAIM_LIMIT = 2;

export const equipmentCatalog = [
  {
    id: "storage-bag",
    name: "初级储物袋",
    price: 200,
    effect: "增加一个元神印记保留槽",
    boundary: "不延长服务端租约",
  },
  {
    id: HEAVENLY_MIRROR_ID,
    name: "天机镜",
    price: 350,
    effect: "展示任务依赖图和历史失败摘要",
    boundary: "不展示隐藏测试答案",
  },
  {
    id: CALCULATION_ARRAY_ID,
    name: "演算阵盘",
    price: 500,
    effect: "提交前运行完整本地预检",
    boundary: "不改变服务端审判结果",
  },
  {
    id: "heart-talisman",
    name: "护心符",
    price: 300,
    effect: "一次失败后延长检查点保留时间",
    boundary: "不退还真实算力消耗",
  },
  {
    id: SPLIT_MIND_PENDANT_ID,
    name: "分神玉佩",
    price: 1200,
    effect: "将并发认领上限从 1 提升至 2",
    boundary: "仍受功德和境界门槛限制",
  },
  {
    id: "teaching-slip",
    name: "传功玉简",
    price: 800,
    effect: "增加一个功法预设槽",
    boundary: "预设内容仍需通过安全检查",
  },
] as const;

export type EquipmentItem = (typeof equipmentCatalog)[number];

export function getEquipmentItem(id: string): EquipmentItem | undefined {
  return equipmentCatalog.find((item) => item.id === id);
}
