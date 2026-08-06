import { createContext, useContext, useState, ReactNode } from 'react';

export type Lang = 'ar' | 'en' | 'ur';

const arTranslations = {
  companyName: 'فيمتو سوفت للخدمات التكنولوجية',
  companyTagline: 'حلول متكاملة للتكنولوجيا الحياتية',
  companyFounded: '🇪🇬 تأسست في مصر | 🇸🇦 نعمل في السعودية',
  companyDescription: 'منذ 2003، نقدم حلولاً رقمية متطورة في مجالات متعددة: برمجيات تفاعلية، شبكات وبنية تحتية، أنظمة أمنية، كمبيوتر فيجن، حلول مرورية، وأنظمة متكاملة.',
  projectStatusActive: '✅ نشط',
  projectStatusComingSoon: '🟡 قريباً',
  projectStatusPlanned: '📋 مخطط',
  projectEnter: '🚀 اضغط للدخول',
  projectUnderDevelopment: '⏳ قيد التطوير',
  aboutUs: '🇪🇬 من نحن؟',
  aboutUsText: 'فيمتو سوفت شركة مصرية تأسست عام 2003، ونعمل حالياً في المملكة العربية السعودية. نقدم حلولاً تكنولوجية متكاملة في مجالات متعددة، تشمل برمجيات إدارة المصانع (ERP)، أنظمة الأمن والمراقبة، شبكات البنية التحتية، الذكاء الاصطناعي والرؤية الآلية، والحلول المرورية الذكية.',
  contactPhone: '+20 100 100 6627',
  contactEmail: 'info@fimtosoft.com',
  footerRights: '© 2003-2026 فيمتو سوفت للخدمات التكنولوجية. جميع الحقوق محفوظة.',
  footerDesign: '🏗️ تصميم وتطوير د. أحمد عبده عليان',
};

const enTranslations = {
  companyName: 'FIMTO Software for Technological Services',
  companyTagline: 'Comprehensive Life Technology Solutions',
  companyFounded: '🇪🇬 Founded in Egypt | 🇸🇦 Operating in Saudi Arabia',
  companyDescription: 'Since 2003, we provide advanced digital solutions across multiple fields: interactive software, networks and infrastructure, security systems, computer vision, traffic solutions, and comprehensive systems.',
  projectStatusActive: '✅ Active',
  projectStatusComingSoon: '🟡 Coming Soon',
  projectStatusPlanned: '📋 Planned',
  projectEnter: '🚀 Click to Enter',
  projectUnderDevelopment: '⏳ Under Development',
  aboutUs: '🇪🇬 About Us',
  aboutUsText: 'FIMTO Software is an Egyptian company founded in 2003, and we currently operate in the Kingdom of Saudi Arabia. We provide comprehensive technological solutions in multiple fields, including factory management software (ERP), security and surveillance systems, infrastructure networks, artificial intelligence and computer vision, smart traffic solutions, and integrated systems.',
  contactPhone: '+20 100 100 6627',
  contactEmail: 'info@fimtosoft.com',
  footerRights: '© 2003-2026 FIMTO Software for Technological Services. All rights reserved.',
  footerDesign: '🏗️ Designed and developed by Dr. Ahmed Abdo Alyan',
};

const urTranslations = {
  companyName: 'فيمتو سوفٹ فار ٹیکنالوجی سروسز',
  companyTagline: 'حلول زندگی کامل ٹیکنالوجی',
  companyFounded: '🇪🇬 مصر میں قائم | 🇸🇦 سعودی عرب میں کام کرتے ہیں',
  companyDescription: '2003 سے، ہم متعدد شعبوں میں جدید ڈیجیٹل حل فراہم کرتے ہیں: انٹرایکٹو سافٹ ویئر، نیٹ ورک اور انفراسٹرکچر، سیکیورٹی سسٹم، کمپیوٹر وژن، ٹریفک حل، اور جامع نظام.',
  projectStatusActive: '✅ فعال',
  projectStatusComingSoon: '🟡 جلد آئے گا',
  projectStatusPlanned: '📋 منصوبہ شدہ',
  projectEnter: '🚀 داخل ہوں',
  projectUnderDevelopment: '⏳ تیاری کے تحت',
  aboutUs: '🇪🇬 ہم کون ہیں؟',
  aboutUsText: 'فيمتوتو سوفٹ ایک مصری کمپنی ہے جو 2003 میں قائم ہوئی تھی، اور ہم فی الحال سعودی عرب میں کام کرتے ہیں۔ ہم متعدد شعبوں میں جامع ٹیکنالوجیکل حل فراہم کرتے ہیں، بشمول فیکٹری مینجمنٹ سافٹ ویئر (ERP)، سیکیورٹی اور نگرانی کے نظام، انفراسٹرکچر نیٹ ورکس، مصنوعی ذہانت اور کمپیوٹر ویژن، اور سمارٹ ٹریفک حل.',
  contactPhone: '+20 100 100 6627',
  contactEmail: 'info@fimtosoft.com',
  footerRights: '© 2003-2026 فِيمٹُ سافٹ فار ٹیکنالوجِی سروسز۔ تمام حقوق محفوظ ہیں۔',
  footerDesign: '🏗️ ڈیزائن اور ڈیولپمنٹ: ڈاکٹر احمد عبدہ علیان',
};

export { arTranslations, enTranslations, urTranslations };
