#include <iostream>
#include <unistd.h>
#include <chrono>
using namespace std;
int main() {
    auto start_time = chrono::steady_clock::now();
    sleep(2);
    cout << "C++: " << chrono::duration_cast<chrono::milliseconds>(chrono::steady_clock::now() - start_time).count() << " ms" << endl;
    return 0;
}