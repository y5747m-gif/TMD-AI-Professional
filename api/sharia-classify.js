// api/sharia-classify.js
// Classification module for Sharia inquiries ensuring precise query routing

export function classifyQuery(userQuery) {
  const query = userQuery.toLowerCase();

  const categories = {
    fiqh_ibadat: ["صلاة", "صوم", "زكاة", "حج", "طهارة", "وضوء"],
    fiqh_muamalat: ["بيع", "شراء", "ربا", "تجارة", "عقد", "دين"],
    aqeedah: ["إيمان", "توحيد", "قدر", "أسماء وصفات", "شرك"],
    hadith: ["حديث", "رواية", "إسناد", "البخاري", "مسلم"]
  };

  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => query.includes(kw))) {
      return { category, priority: "HIGH", requiresExactReference: true };
    }
  }

  return { category: "general_islamic", priority: "NORMAL", requiresExactReference: true };
}
