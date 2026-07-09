// 预编译宏：在 Windows 发布构建中隐藏控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    carvis_lib::run()
}
